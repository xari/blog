import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import sharp from "sharp";
import { JSDOM } from "jsdom";
import YAML from "yaml";
import MarkdownIt from "markdown-it";
import front_matter_plugin from "markdown-it-front-matter";
import prism_plugin from "markdown-it-prism";

function createPreviewContent(dom) {
  return ({ title, description, date, path }) => {
    const article = dom.window.document.createElement("article");
    const header = dom.window.document.createElement("header");
    const heading = dom.window.document.createElement("h2");
    const anchor = dom.window.document.createElement("a");
    const time = dom.window.document.createElement("time");
    const p = dom.window.document.createElement("p");

    article.classList.add("blog-preview");

    heading.textContent = title;
    heading.tabIndex = "0";

    anchor.href = path;

    time.datetime = date;
    time.textContent = date.toDateString();

    p.textContent = description;

    anchor.appendChild(heading);
    header.appendChild(anchor);
    header.appendChild(time);
    article.appendChild(header);
    article.appendChild(p);

    return article;
  };
}

function createBlogPage(dom) {
  return (blogPost) => {
    const article = dom.window.document.createElement("article");
    const header = dom.window.document.createElement("header");
    const heading = dom.window.document.createElement("h1");
    const time = dom.window.document.createElement("time");
    const section = dom.window.document.createElement("section");

    article.classList.add("blog-content");

    heading.textContent = blogPost.title;

    time.datetime = blogPost.date;
    time.textContent = blogPost.date.toDateString();

    section.innerHTML = blogPost.content;

    header.appendChild(time);
    header.appendChild(heading);
    article.appendChild(header);
    article.appendChild(section);
    dom.window.document.getElementById("content").replaceWith(article);

    return dom;
  };
}

function createIndexTitle(dom) {
  const titleHeading = dom.window.document.createElement("h1");
  const titleAnchor = dom.window.document.createElement("a");

  titleAnchor.href = "https://www.xari.dev";

  titleHeading.classList.add("index-title");
  titleHeading.textContent = "Ideas in Development";

  titleAnchor.appendChild(titleHeading);
  dom.window.document.getElementById("title").replaceWith(titleHeading);

  return dom;
}

function parsePost(md) {
  let title, description, date, image; // frontmatter

  const content = MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  })
    .use(
      front_matter_plugin,
      (frontmatter) =>
        ({ title, description, date, image } = YAML.parse(frontmatter))
    )
    .use(prism_plugin)
    .render(md);

  return {
    title,
    description,
    date: new Date(date),
    image,
    content,
  };
}

// Resolves to an object, each of whose properties is an array of files
async function getFileStructure(fileStructure, origin) {
  return await fs.readdir(origin, { withFileTypes: true }).then((files) => {
    return files.reduce(async (acc, file) => {
      if (file.isDirectory() && file.name !== "node_modules") {
        return getFileStructure(acc, path.join(origin, file.name));
      } else {
        return (await acc).hasOwnProperty(path.extname(file.name))
          ? {
              ...(await acc), // Remember: getFileStructure is async & recursive
              [path.extname(file.name)]: [
                ...(await acc)[path.extname(file.name)],
                {
                  name: path.parse(file.name).name,
                  path: path.relative(
                    process.cwd(),
                    path.join(origin, file.name)
                  ),
                },
              ],
            }
          : acc;
      }
    }, fileStructure);
  });
}

async function getFileContent(file) {
  const content = await fs.readFile(file.path, "utf8").then(parsePost);

  return {
    ...file,
    content,
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const origin = path.join(__dirname, "src");
const __destination = path.join(__dirname, "dist");

const fileTypes = [".md", ".png", ".jpg", ".jpeg", ".svg", ".gif"];

// Resolves to an object, each of whose properties is an array of files
const { md, img } = await getFileStructure(
  fileTypes.reduce((o, key) => ({ ...o, [key]: [] }), {}),
  origin
).then(({ ".md": md, ...img }) => {
  const _md = md.map(getFileContent);
  const _img = Object.keys(img)
    .reduce((paths, key) => paths.concat(img[key]), [])
    .map(({ path: _path }) => ({
      path: path.relative(path.join(origin, "content"), _path),
      sharp: sharp(
        _path,
        path.extname(_path) === ".gif" ? { animated: true } : {} // Keeps frames for animated GIFs
      ).resize({
        width: 600,
        fit: "inside",
      }),
    }));

  return {
    md: _md,
    img: _img,
  };
});

// Write the image files
img.forEach(({ path: _path, sharp }) =>
  fs
    .mkdir(path.join(__destination, path.parse(_path).dir), {
      recursive: true,
    })
    .then(() => sharp.toFile(path.join(__destination, _path)))
);

// Create the blog posts
const posts = await Promise.all(md)
  .then((x) =>
    x.map(({ content: blogPost, path: postPath, ...postData }) => {
      const relPostPath = path.relative(
        path.join(__dirname, "src", "content"),
        postPath
      );
      const destinationPath = path.parse(
        path.join(__destination, relPostPath)
      ).dir;

      return {
        ...postData,
        path: destinationPath,
        title: blogPost.title,
        date: blogPost.date,
        description: blogPost.description,
        content: JSDOM.fromFile(path.join(__dirname, "index.html"))
          .then((dom) => {
            const head = dom.window.document.querySelector("head");

            const favicon = dom.window.document.createElement("link");
            const faviconPath = path.relative(
              destinationPath,
              path.join(__destination, "favicon.ico")
            );

            favicon.href = faviconPath;
            favicon.rel = "icon";
            favicon.type = "image/x-icon";

            head.appendChild(favicon);

            const prismCSS = dom.window.document.createElement("link");

            prismCSS.rel = "stylesheet";
            prismCSS.href = path.relative(
              destinationPath,
              path.join(__destination, "prism.css")
            );

            head.appendChild(prismCSS);

            const indexCSS = dom.window.document.createElement("link");

            indexCSS.rel = "stylesheet";
            indexCSS.href = path.relative(
              destinationPath,
              path.join(__destination, "index.css")
            );

            head.appendChild(indexCSS);

            const siteName = dom.window.document.createElement("meta");
            const siteDescription = dom.window.document.createElement("meta");

            siteName.name = "title";
            siteName.content = blogPost.title;

            siteDescription.name = "description";
            siteDescription.content = blogPost.description;

            head.appendChild(siteName);
            head.appendChild(siteDescription);

            // Defined in blog post YAML, or defaults to something else
            const previewImgPath = blogPost.image
              ? blogPost.image
              : path.resolve(__destination, "preview.png");

            // FaceBook
            const ogName = dom.window.document.createElement("meta");
            const ogTitle = dom.window.document.createElement("meta");
            const ogDescription = dom.window.document.createElement("meta");
            const ogImg = dom.window.document.createElement("meta");
            const ogType = dom.window.document.createElement("meta");
            const ogTime = dom.window.document.createElement("meta");

            ogName.setAttribute("property", "og:site_name");
            ogName.setAttribute("content", "Xari.Dev -Ideas in Development");

            ogTitle.setAttribute("property", "og:title");
            ogTitle.setAttribute("content", blogPost.title);

            ogDescription.setAttribute("property", "og:description");
            ogDescription.setAttribute("content", blogPost.description);

            ogImg.setAttribute("property", "og:image");
            ogImg.setAttribute("content", previewImgPath);

            ogType.setAttribute("property", "og:type");
            ogType.setAttribute("content", "website");

            ogTime.setAttribute("property", "og:updated_time");
            ogTime.setAttribute("content", blogPost.date);

            head.appendChild(ogName);
            head.appendChild(ogTitle);
            head.appendChild(ogDescription);
            head.appendChild(ogImg);
            head.appendChild(ogType);
            head.appendChild(ogTime);

            // Google+
            const metaName = dom.window.document.createElement("meta");
            const metaDescription = dom.window.document.createElement("meta");
            const metaImg = dom.window.document.createElement("meta");

            metaName.setAttribute("itemprop", "name");
            metaName.setAttribute("content", blogPost.title);

            metaDescription.setAttribute("itemprop", "description");
            metaDescription.setAttribute("content", blogPost.description);

            metaImg.setAttribute("itemprop", "image");
            metaImg.setAttribute("content", previewImgPath);

            head.appendChild(metaName);
            head.appendChild(metaDescription);
            head.appendChild(metaImg);

            return dom;
          })
          .then((dom) => {
            const titleAnchor = dom.window.document.createElement("a");

            titleAnchor.textContent = "Ideas in Development";
            titleAnchor.href = path.relative(
              destinationPath,
              path.join(__destination, "index.html")
            );

            dom.window.document
              .getElementById("title")
              .replaceWith(titleAnchor);

            return dom;
          })
          .then((dom) => createBlogPage(dom)(blogPost))
          .then((dom) => dom.serialize()),
      };
    })
  )
  .then((x) =>
    x.map(async ({ name, path: destinationPath, content, ...details }) => {
      const fileURL = fs
        .mkdir(destinationPath, { recursive: true })
        .then(async () => {
          const fileURL = path.join(destinationPath, `${name}.html`);

          return fs.writeFile(fileURL, await content).then(() => fileURL);
        })
        .catch(console.error);

      return { path: path.relative(__destination, await fileURL), ...details };
    })
  );

// Create the front-page
Promise.all(posts)
  .then((x) =>
    x.sort((a, b) => (a.date > b.date ? -1 : a.date > b.date ? 1 : 0))
  )
  .then((x) =>
    JSDOM.fromFile(path.join(__dirname, "index.html"))
      .then((dom) => {
        const head = dom.window.document.querySelector("head");
        const indexCSS = dom.window.document.createElement("link");
        const favicon = dom.window.document.createElement("link");

        favicon.href = "favicon.ico";
        favicon.rel = "icon";
        favicon.type = "image/x-icon";

        head.appendChild(favicon);

        indexCSS.rel = "stylesheet";
        indexCSS.href = "./index.css";

        head.appendChild(indexCSS);

        return dom;
      })
      .then(createIndexTitle)
      .then((dom) => {
        dom.window.document
          .getElementById("content")
          .replaceWith(...x.map((post) => createPreviewContent(dom)(post)));

        return dom;
      })
      .then((dom) => dom.serialize())
  )
  .then(async (html) =>
    fs.writeFile(path.join(__destination, "index.html"), await html)
  );
