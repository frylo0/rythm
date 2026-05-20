const fs = require("fs/promises");
const crypto = require("crypto");
const readline = require("readline");
const bcrypt = require("bcryptjs");

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });
}

function ask(rl, question, options = {}) {
  if (!options.hidden) {
    return new Promise((resolve) => rl.question(question, resolve));
  }

  const originalWrite = rl._writeToOutput;
  rl._writeToOutput = function (value) {
    //if (rl.stdoutMuted && value.trim()) {
    //  rl.output.write("*");
    //  return;
    //}
    rl.output.write(value);
  };

  return new Promise((resolve) => {
    rl.stdoutMuted = true;
    rl.question(question, (answer) => {
      rl.stdoutMuted = false;
      rl._writeToOutput = originalWrite;
      rl.output.write("\n");
      resolve(answer);
    });
  });
}

function envLine(key, value) {
  return `${key}=${String(value).replace(/\n/g, "")}`;
}

async function main() {
  const rl = createInterface();
  try {
    const port = (await ask(rl, "Порт для docker compose [3000]: ")).trim() || "3000";
    const password = await ask(rl, "Пароль приложения (пусто = без пароля): ", { hidden: true });
    let passwordHash = "";

    if (password) {
      const repeat = await ask(rl, "Повторите пароль: ", { hidden: true });
      if (password !== repeat) {
        throw new Error("Пароли не совпали.");
      }
      passwordHash = await bcrypt.hash(password, 10);
    }

    const cookieSecret = crypto.randomBytes(32).toString("base64url");
    const body = [
      envLine("PORT", port),
      envLine("RYTHM_PASSWORD_HASH", passwordHash),
      envLine("RYTHM_COOKIE_SECRET", cookieSecret),
      ""
    ].join("\n");

    await fs.writeFile(".env", body, { mode: 0o600 });
    console.log(passwordHash ? ".env создан. Авторизация будет включена для нового состояния." : ".env создан. Пароль не задан.");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
