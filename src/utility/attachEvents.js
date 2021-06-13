export const attachEvents = (config) => {
  const { container, onButtonClick } = config;
  const buttons = container.querySelectorAll(".input button");
  buttons.forEach((button) => {
    const amount = parseInt(button.innerHTML.replace(/,/g, ""), 10);
    button.addEventListener("click", () => onButtonClick(amount));
  });
};
