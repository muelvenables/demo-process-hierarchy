// execute is a function that drops a generator into the runtime
// for processing
export const createRuntime = function (config = {}) {
  // destructure the configuration
  const { maxUnitOfWorkDurationInMs = 10 } = config;
  // this is going to hold a map of the in-progress generator objects,
  // keyed by the functions that initiated them
  let processesByFunction = new Map();

  const rootGeneratorFunction = function* () {
    // keep looping until there's nothing left
    while (processesByFunction.size > 0) {
      // get all of the active generator functions
      let activeGenerators = Array.from(processesByFunction.keys());
      // loop through each generator...
      for (const activeGenerator of activeGenerators) {
        // ...get the iterator for that generator...
        const activeResult = processesByFunction.get(activeGenerator);
        // ...and step one forward
        const step = activeResult.next();
        // delete it if we've reached the end
        if (step.done) {
          processesByFunction.delete(activeGenerator);
        }
        yield;
      }
    }
  };
  let rootGenerator = null;

  // define the part of our basic runtime that runs the executed
  // function as much as it can before our time is up...
  const processUnitOfWork = () => {
    try {
      // bail if there's nothing to do
      if (!rootGenerator) {
        return;
      }
      // so we've got work to do, set a limit on how
      // long we can work for
      const now = new Date().valueOf();
      const finishAfter = now + maxUnitOfWorkDurationInMs;
      while (new Date().valueOf() < finishAfter) {
        // run through to the next yield
        const stepData = rootGenerator.next();
        // check if we're done...
        if (stepData.done) {
          // ...and if we are, clean up and leave
          rootGenerator = null;
          return;
        }
      }
    } finally {
      // always schedule the processing of our next unit of work
      requestAnimationFrame(processUnitOfWork);
    }
  };

  // kick of the runtime!
  requestAnimationFrame(processUnitOfWork);

  // this is what will be assigned to `execute`. It's not really
  // doing any serious execution itself, it's just kicking off the
  // generator function and assigning to the processesByFunction object,
  // which is processed in chunks by `processUnitOfWork` (above).
  return (fn, ...args) => {
    processesByFunction.set(fn, fn(...args));
    // if the root generator has been killed then kick it back off
    if (!rootGenerator) {
      rootGenerator = rootGeneratorFunction();
    }
  };
};
