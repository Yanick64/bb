export {};

const children = [
  Bun.spawn(["bun", "--watch", "server/index.ts"], { stdout: "inherit", stderr: "inherit" }),
  Bun.spawn(["bun", "run", "dev:web"], { stdout: "inherit", stderr: "inherit" }),
];
function stop() {
  for (const child of children) child.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await Promise.race(children.map((child) => child.exited));
stop();
