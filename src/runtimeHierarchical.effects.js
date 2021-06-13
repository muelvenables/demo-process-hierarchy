export const spawn = (fn, ...args) => ({
  type: "@@muel/instruction",
  instruction: "fork",
  fn,
  args,
  detached: true
});

export const fork = (fn, ...args) => ({
  type: "@@muel/instruction",
  instruction: "fork",
  fn,
  args,
  detached: false
});

export const cancel = (task) => ({
  type: "@@muel/instruction",
  instruction: "cancel",
  task
});

export const take = (channel) => ({
  type: "@@muel/instruction",
  instruction: "take",
  channel
});

export const put = (channel, value) => ({
  type: "@@muel/instruction",
  instruction: "put",
  channel,
  value
});
