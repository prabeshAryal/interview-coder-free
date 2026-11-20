delete process.env.ELECTRON_RUN_AS_NODE;
const { spawn } = require("child_process");
const electronPath = require("electron");

const args = process.argv.slice(2);
if (args.length === 0) {
  args.push(".");
}

const child = spawn(electronPath, args, { stdio: "inherit", windowsHide: false });
child.on("close", (code) => process.exit(code || 0));
