const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { DateTime } = require("luxon");
const jsdom = require("jsdom");
const YAML = require("yaml");

function postTemplate({ title, content, date }) {
  return `
      <article>
        <header class="my-3">
          <h1 class="text-5xl">${title}</h1>
          <p>${date}</p>
        </header>
        <section class="prose content">
          ${content}
        </section>
      </article>
    `;
}

const { JSDOM } = jsdom;

async function handleImg(file, destination) {
  try {
    await sharp(file)
      .resize({
        width: 600,
        fit: "inside",
      })
      .toFile(destination);
  } catch (error) {
    console.log(`An error occurred during processing: ${error}`);
  }
}

function handleMarkdown(filename, origin, destination) {
  fs.readFile(path.join(origin, filename), "utf8", (err, data) => {
    if (err) {
      console.error(err);

      return;
    }

    let title, description, date; // frontmatter

    const parseMarkdown = require("markdown-it")({
        html: true,
        linkify: true,
        typographer: true,
      }).use(
        require("markdown-it-front-matter"),
        (frontmatter) =>
          ({ title, description, date } = YAML.parse(frontmatter))
      ),
      content = parseMarkdown.render(data);

    // Creates the directory if it doesn't exist yet.
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    const stream = fs.createWriteStream(path.join(destination, "index.html"));

    stream.once("open", async (fd) => {
      const dom = await JSDOM.fromFile(path.join(__dirname, "index.html")); // Fix this later to not use a global var/__dirname

      dom.window.document.getElementById("content").innerHTML = postTemplate({
        title,
        date: DateTime.fromISO(date).toLocaleString({
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        content,
      });

      stream.write(dom.serialize());

      stream.end();
    });
  });
}

const dir = "cloud-pricing"; // ./content/cloud-pricing
const origin = path.join(__dirname, "content", dir);
const destination = path.join(__dirname, "dist", dir);

// Test read all files in dir
fs.readdir(origin, { withFileTypes: true }, (err, files) => {
  files.forEach((file) => {
    switch (path.extname(file.name)) {
      case ".png":
      case ".jpg":
      case ".svg":
      case ".gif":
        handleImg(
          path.join(origin, file.name),
          path.join(destination, file.name)
        );
        break;
      case ".md":
        handleMarkdown(file.name, origin, destination);
        break;
      default:
        console.info(`Unmatched file extension: ${file.name}.`);
    }
  });
});
