import fs from "fs";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import sharp from "sharp";
import { DateTime } from "luxon";
import { JSDOM } from "jsdom";
import YAML from "yaml";
import MarkdownIt from "markdown-it";
import front_matter_plugin from "markdown-it-front-matter";

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

    const parseMarkdown = MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
      }).use(
        front_matter_plugin,
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const origin = path.join(__dirname, "content", "cloud-pricing");
const destination = path.join(__dirname, "dist", "cloud-pricing");

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
