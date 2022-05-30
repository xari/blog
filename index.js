import express from "express";
import { mkdirSync, promises as fs } from "fs";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import sharp from "sharp";
import { DateTime } from "luxon";
import { JSDOM } from "jsdom";
import YAML from "yaml";
import MarkdownIt from "markdown-it";
import front_matter_plugin from "markdown-it-front-matter";

function indexTemplate({ title, description, date, url }) {
  return `
  <article class="max-w-xl mb-10">
      <header>
          <h3 class="text-3xl">
          <a href="./${url}">${title}</a>
          </h3>
          <small>${date}</small>
      </header>
      <section>
          <p class="mt-0">${description}</p>
      </section>
  </article>`;
}

function postTemplate({ title, description, date, content }) {
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

function indexTemplateWrapper(html) {
  return `
   <header>
    <h1 class="text-5xl my-3">
      <a href="/">Ideas in Development</a>
    </h1>
   </header>
   <main class="my-3">
    ${html}
   </main>`;
}

function postTemplateWrapper(html) {
  return `
  <header>
    <h3 class="text-xl my-3">
      <a href="/">Ideas in Development</a>
    </h3>
  </header>
  <main class="my-3">
    ${html}
  </main>`;
}

function parseMD(md, callback = (x) => x) {
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

    resolve(
      callback({
        title,
        description,
        date: DateTime.fromISO(date).toLocaleString({
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        content,
      })
    );
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

function hydrateDOM(path, html) {
  return JSDOM.fromFile(path).then((dom) => {
    dom.window.document.getElementById("content").innerHTML = html;

    return dom.serialize();
  });
}

// This bit is slightly crazy...
// build() will return an array of Promises that are the result of recursively calling build.
// These promises resolve to the post metadata (title, description, date) that will be used to build the index page.
// The reason for all of this is that it lets me recursively build ./dist files for every directory in ./src....
// Meaning that if I want to have content at xari.dev/horizontal-bar-plot/intro/index.html —I can do that!
async function build(acc, origin, destination) {
  return await fs.readdir(origin, { withFileTypes: true }).then((files) => {
    mkdirSync(destination, { recursive: true });

    return files.reduce(async (acc, file) => {
      if (file.isDirectory() && file.name !== "node_modules") {
        return build(
          acc,
          path.join(origin, file.name),
          path.join(destination, file.name)
        );
      } else {
        switch (path.extname(file.name)) {
          case ".png":
          case ".jpg":
          case ".jpeg":
          case ".svg":
          case ".gif":
            handleImg(
              path.join(origin, file.name),
              path.join(destination, file.name)
            );
            return acc;
            break;
          case ".md":
            return [
              ...(await acc), // Remember: we're in an async reducer
              new Promise((resolve) => {
                fs.readFile(path.join(origin, file.name), "utf8")
                  .then((md) =>
                    parseMD(md, (postData) => {
                      let { title, description, date } = postData;

                      resolve({
                        title,
                        description,
                        date,
                        url: path.relative(
                          path.join(__dirname, "dist"),
                          destination
                        ),
                      });

                      return postData; // Must return postData to not break the then() chain in parseMD()
                    })
                  )
                  .then(postTemplate)
                  .then((html) =>
                    hydrateDOM(
                      path.join(__dirname, "index.html"),
                      postTemplateWrapper(html)
                    )
                  )
                  .then((html) =>
                    fs.writeFile(path.join(destination, "index.html"), html)
                  );
              }),
            ];
            break;
          default:
            console.info(`Unmatched file extension: ${file.name}.`);
            return acc;
        }
      }
    }, acc);
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const origin = path.join(__dirname, "src");
const destination = path.join(__dirname, "dist");

const posts = await build([], origin, destination);

Promise.all(posts)
  .then((x) => x.filter((y) => !Object.values(y).includes(undefined)))
  .then((x) =>
    x.reduce((acc, cur) => {
      return acc.concat(indexTemplate(cur));
    }, "")
  )
  .then((x) =>
    hydrateDOM(path.join(__dirname, "index.html"), indexTemplateWrapper(x))
  )
  .then((html) => fs.writeFile(path.join(destination, "index.html"), html));

const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname, "dist"))).listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
