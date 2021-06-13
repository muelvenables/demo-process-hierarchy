import "./monitor.css";

class Monitor {
  constructor(selector) {
    this.container = document.querySelector(selector);
    this.container.classList.add("monitor");
    this.fps = document.createElement("div");
    this.fps.className = "fps";
    this.fps.innerHTML = "-- fps";
    this.container.appendChild(this.fps);
    this.blip = document.createElement("div");
    this.blip.className = "blip";
    this.container.appendChild(this.blip);
    this.frame = 0;
    const frameCheckRate = 25;
    this.tick = () => {
      this.frame++;
      if (this.frame > 100) {
        this.maxWidth = this.container.offsetWidth / 100;
        this.frame -= 100;
      }
      this.blip.style.transform = `translate(${
        this.frame * this.maxWidth
      }px,48px)`;
      if (this.frame % frameCheckRate === 0) {
        const then = this.lastFrame;
        const now = new Date().valueOf();
        this.lastFrame = now;
        this.fps.childNodes[0].nodeValue = `${(
          (frameCheckRate * 1000) /
          (now - then)
        ).toFixed(1)} fps`;
      }
      this.ticker = requestAnimationFrame(this.tick);
    };
  }

  start() {
    this.maxWidth = this.container.offsetWidth / 100;
    this.lastFrame = new Date().valueOf();
    this.ticker = requestAnimationFrame(this.tick);
  }

  pause() {
    cancelAnimationFrame(this.ticker);
  }
}

const monitor = new Monitor("#monitor");
monitor.start();
