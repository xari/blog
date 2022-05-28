import { mkdirSync, promises as fs } from "fs";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import sharp from "sharp";
import { DateTime } from "luxon";
import { JSDOM } from "jsdom";
import YAML from "yaml";
import MarkdownIt from "markdown-it";
import front_matter_plugin from "markdown-it-front-matter";

function templateFromData({ title, content, date }) {
  return new Promise((resolve, reject) => {
    // Should have all arguments...
    typeof title !== "undefined" &&
    typeof content !== "undefined" &&
    typeof date !== "undefined"
      ? resolve(`
      <article>
        <header class="my-3">
          <h1 class="text-5xl">${title}</h1>
          <p>${date}</p>
        </header>
        <section class="prose content">
          ${content}
        </section>
      </article>
    `)
      : reject("Missing at least one of the data");
  });
}

// TODO: Should reject immediately if no md/if md not a string?
function parseMD(md) {
  return new Promise((resolve) => {
    let title, description, date; // frontmatter

    const content = MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
    })
      .use(
        front_matter_plugin,
        (frontmatter) =>
          ({ title, description, date } = YAML.parse(frontmatter))
      )
      .render(md);

    resolve({
      title,
      description,
      date: DateTime.fromISO(date).toLocaleString({
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      content,
    });
  });
}

function handleImg(origin, destination) {
  sharp(origin)
    .resize({
      width: 600,
      fit: "inside",
    })
    .toFile(destination);
}

function handleMD(origin) {
  return fs.readFile(origin, "utf8").then(parseMD).then(templateFromData);
}

function hydrateDOM(postHTML) {
  return JSDOM.fromFile(path.join(__dirname, "index.html")).then((dom) => {
    dom.window.document.getElementById("content").innerHTML = postHTML;

    return dom.serialize();
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const postSlug = "cloud-pricing";
const origin = path.join(__dirname, "src", postSlug);
const destination = path.join(__dirname, "dist", postSlug);

// Test read all files in dir
fs.readdir(origin, { withFileTypes: true }).then((files) => {
  mkdirSync(destination, { recursive: true });

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
        handleMD(path.join(origin, file.name))
          .then(hydrateDOM)
          .then((html) =>
            fs.writeFile(path.join(destination, "index.html"), html)
          );
        break;
      default:
        console.info(`Unmatched file extension: ${file.name}.`);
    }
  });
});
