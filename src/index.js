import "./styles.css";
import "./utility/monitor";
import { attachEvents } from "./utility/attachEvents";

import { Runtime, Channel } from "./runtimeHierarchical";
import { cancel, fork, put, spawn, take } from "./runtimeHierarchical.effects";

const CHECKPOINT_EACH = 3000;
const MAX_RATE_OVER_CHECKPOINTS = 10;
const MIN_RATE_OVER_CHECKPOINTS = 5;

const containers = document.querySelectorAll(".container");

const rateCalculator = (() => {
  let maxRate = 0;
  const minCheckpointCount =
    MIN_RATE_OVER_CHECKPOINTS < 2 ? 2 : MIN_RATE_OVER_CHECKPOINTS;
  return (checkpoints, element) => {
    const checkpointCount = checkpoints.length;
    if (checkpointCount >= minCheckpointCount) {
      const total = CHECKPOINT_EACH * (checkpointCount - 1);
      const oldest = checkpoints[0];
      const newest = checkpoints[checkpointCount - 1];
      const secondsTaken = (newest - oldest) / 1000;
      const totalPerSecond = total / secondsTaken;
      if (totalPerSecond > maxRate) {
        maxRate = totalPerSecond;
      }
      element.childNodes[0].nodeValue = `${Math.round(
        totalPerSecond / 1000
      )}/ms`;
      return maxRate === 0 ? 0 : totalPerSecond / maxRate;
    }
    return 0;
  };
})();

containers.forEach((container) => {
  const outputElement = container.querySelector(".output .count");
  const rateMaskElement = container.querySelector(".output .rate-mask");
  const rateAmountElement = container.querySelector(".output .rate-amount");

  const inputChannel = new Channel();

  function* controller(clickedNumberChannel) {
    // create the channel for our counter & rate processes to communicate
    const timingChannel = new Channel();
    let counterTask = null;

    // instruct the runtime to spawn a new process with the rate function
    yield spawn(rate, timingChannel, rateCalculator);

    while (true) {
      // instruct the runtime to wait until there's a new number
      // fed into the input channel (clickedNumberChannel)
      const countUpToValue = yield take(clickedNumberChannel);

      // if there's an existing counter running then cancel it
      if (counterTask) {
        yield cancel(counterTask);
      }
      // fork a new counter process
      counterTask = yield fork(counter, timingChannel, countUpToValue);
    }
  }

  function* rate(timingChannel, rateCalculator) {
    const checkpoints = [];
    while (true) {
      // instruct the runtime to pause until a new checkpoint is broadcast
      const lastCheckpointTimestamp = yield take(timingChannel);
      // if we receive a null then the count finished so clear the checkpoints
      if (lastCheckpointTimestamp === null) {
        checkpoints.splice(0, checkpoints.length);
      } else {
        // add the new checkpoint to the end of the array
        checkpoints.push(lastCheckpointTimestamp);
        // if we've pushed above 5 checkpoints remove the oldest
        if (checkpoints.length > MAX_RATE_OVER_CHECKPOINTS) {
          checkpoints.shift();
        }
      }
      // calculate the rate
      const relativeToMax = yield rateCalculator(
        checkpoints,
        rateAmountElement
      );
      rateMaskElement.style.transform = `scaleY(${1 - relativeToMax})`;
    }
  }

  // define business logic
  function* counter(timingChannel, max) {
    for (let i = 1; i <= max; i++) {
      // update the output
      outputElement.childNodes[0].nodeValue = yield `${i}`;
      // hit a multiple of RATE_CHECKPOINT_EVERY? Broadcast a timestamp
      if (i % CHECKPOINT_EACH === 0) {
        yield put(timingChannel, Date.now());
      }
    }
    yield put(timingChannel, null);
  }

  // start the controller running
  Runtime.instance.execute(controller, inputChannel);

  // attach click events
  attachEvents({
    container,
    onButtonClick: (amount) => inputChannel.put(amount)
  });
});
