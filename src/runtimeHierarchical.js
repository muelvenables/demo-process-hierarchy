export class Channel {
  constructor() {
    this._buffer = [];
    this._callbacks = [];
    // define a function to see if any messages can be taken
    this._release = () => {
      // do nothing if there's no messages or no takers
      if (this._callbacks.length > 0 && this._buffer.length > 0) {
        // we have a non-empty buffer and at least 1 taker
        const message = this._buffer.shift();
        while (this._callbacks.length > 0) {
          const cb = this._callbacks.shift();
          cb(message);
        }
      }
    };
  }
  put(value) {
    this._buffer.push(value);
    this._release();
  }
  take(callback) {
    this._callbacks.push(callback);
    this._release();
  }
}

class ProcessManager {
  constructor(scheduler) {
    this._roots = [];
    this._processById = {};
    this._lastUsedId = 0;
    this._scheduler = scheduler;
    this._instructions = new InstructionSet(this);

    this._kill = (processId, withException = null, isTop = false) => {
      const me = this.getById(processId);
      if (!me) {
        // the process is already dead
        return;
      }
      const { parent, children } = me;
      // if the top of the process tree is being killed, remove from the tree
      if (isTop) {
        if (parent) {
          parent.children.splice(parent.children.indexOf(me), 1);
        } else {
          this._roots.splice(this._roots.indexOf(me), 1);
        }
      }
      // remove from the index
      delete this._processById[processId];
      // recurse through children through children doing the same
      children.forEach((child) => this._kill(child.id));
      // terminate the process
      if (withException) {
        me._generator.throw(withException);
      } else {
        me._generator.return();
      }
    };
  }

  create(fn, args, parent) {
    const newProcess = new Process(this, parent, fn(...args));
    this._processById[newProcess.id] = newProcess;
    if (!parent) {
      this._roots.push(newProcess);
    } else {
      parent.addChild(newProcess);
    }

    // start the process
    newProcess.ready();
    return newProcess;
  }
  terminate(processId) {
    this._kill(processId, null, true);
  }
  throw(processId, error) {
    this._kill(processId, error, true);
  }
  schedule(process, result) {
    if (typeof result === "undefined") {
      this._scheduler.enqueue(process.stepForward);
    } else {
      const { done, value } = result;
      if (done) {
        this.terminate(process.id);
      } else {
        this._instructions.handle(process, value);
      }
    }
  }

  generateId() {
    this._lastUsedId++;
    return this._lastUsedId;
  }
  getById(id) {
    return this._processById[id];
  }
  get runtime() {
    return this._runtime;
  }
}

class Process {
  constructor(mgr, parent, generator) {
    this.ready = this.ready.bind(this);
    this.addChild = this.addChild.bind(this);
    this.stepForward = this.stepForward.bind(this);
    // a unique ID for the process
    this._id = mgr.generateId();
    // the generator object
    this._generator = generator;
    // 'ready' | 'waiting' | 'terminated'
    this._state = "waiting";
    this._setState = (nextState) => {
      const prevState = this._state;
      // don't allow any change from terminated state
      if (this._state === "terminated") {
        console.warn("Trying to perform action on a terminated process");
        return;
      }
      // transition the state
      this._state = nextState;
      // queue the process to move forward
      if (prevState === "waiting" && nextState === "ready") {
        mgr.schedule(this);
      }
    };
    // create the associated task
    this._task = Object.freeze({
      type: "@@muel/ref",
      id: this._id
    });
    // the manager class
    this._mgr = mgr;
    // the parent of this process
    this._parent = parent;
    // an array of child processes
    this._children = [];
  }

  addChild(fn, args, detached = false) {
    this._children.push(
      fn instanceof Process
        ? fn
        : this._mgr.create(fn, args, detached ? null : this)
    );
  }

  get id() {
    return this._id;
  }

  get children() {
    return this._children;
  }

  get parent() {
    return this._parent;
  }

  get state() {
    return this._state;
  }

  get task() {
    return this._task;
  }

  ready(nextValue) {
    this._next = nextValue;
    this._setState("ready");
  }

  stepForward() {
    if (this._state !== "ready") {
      console.warn("Cannot move process forward while in waiting state");
      return;
    }
    // step the generator forward
    const result = this._generator.next(this._next);
    this._setState("waiting");
    this._mgr.schedule(this, result);
  }
}

export class Scheduler {
  constructor(maxUnitOfWorkDurationInMs) {
    this._maxDuration = maxUnitOfWorkDurationInMs;
    this._useDuration = maxUnitOfWorkDurationInMs;
    this._queue = [];
    this._tickHandle = null;
    this._tick = () => {
      try {
        // so we've got work to do, set a limit on how
        // long we can work for
        const now = new Date().valueOf();
        const finishAfter = now + this._useDuration;
        while (new Date().valueOf() < finishAfter) {
          // run through to the next yield
          const workItem = this._queue.shift();
          if (!workItem) {
            return;
          }
          workItem();
        }
      } finally {
        // always schedule the processing of our next unit of work
        requestAnimationFrame(this._tick);
      }
    };
    requestAnimationFrame(this._tick);
  }

  enqueue(workItem) {
    if (typeof workItem === "function") {
      this._queue.push(workItem);
    } else {
      console.error("Enqueued work item is not a function");
    }
  }
}

export class InstructionSet {
  constructor(mgr) {
    if (!mgr) {
      throw new Error("Process manager expected");
    }
    this._mgr = mgr;
    this._handlers = null;
  }

  validate(value) {
    return (
      typeof value === "object" &&
      value.type === "@@muel/instruction" &&
      "instruction" in value
    );
  }

  handle(process, input) {
    if (!this.validate(input)) {
      process.ready(input);
    } else {
      this.load();
      const handler = this._handlers[input.instruction];
      if (!handler) {
        console.error(`No handler for ${input.instruction}`);
        this._mgr.terminate(process.id);
      }
      handler.handle(process, input);
    }
  }

  load() {
    if (this._handlers) {
      return;
    }
    // load handlers out of the current module by filtering on name
    this._handlers = Object.fromEntries(
      Object.entries(module.exports)
        .filter(([name]) => name.endsWith("InstructionHandler"))
        .map(([_, Handler]) => {
          try {
            const inst = new Handler(this._mgr);
            return inst.instruction ? [inst.instruction, inst] : null;
          } catch {
            return null;
          }
        })
        .filter((entry) => !!entry)
    );
  }
}
export class InstructionHandler {
  constructor(mgr) {
    if (!mgr) {
      throw new Error("Process Manager required");
    }
    this._mgr = mgr;
  }
}
export class ForkInstructionHandler extends InstructionHandler {
  get instruction() {
    return "fork";
  }
  handle(process, { fn, args, detached }) {
    const newProcess = this._mgr.create(
      fn,
      args,
      detached ? undefined : process
    );
    process.ready(newProcess.task);
  }
}
export class TakeInstructionHandler extends InstructionHandler {
  get instruction() {
    return "take";
  }
  handle(process, { channel }) {
    channel.take((value) => process.ready(value));
  }
}
export class PutInstructionHandler extends InstructionHandler {
  get instruction() {
    return "put";
  }
  handle(process, { channel, value }) {
    channel.put(value);
    process.ready();
  }
}
export class CancelInstructionHandler extends InstructionHandler {
  get instruction() {
    return "cancel";
  }
  handle(process, { task }) {
    if (task.type === "@@muel/ref") {
      this._mgr.terminate(task.id);
    }
    process.ready();
  }
}

let _instance;
export class Runtime {
  static get instance() {
    if (!_instance) {
      _instance = new Runtime();
    }
    return _instance;
  }

  constructor() {
    this._scheduler = new Scheduler(6);
    this._processes = new ProcessManager(this._scheduler);
  }

  execute(rootGenerator, ...args) {
    this._processes.create(rootGenerator, args);
  }
}
window.Runtime = Runtime;
