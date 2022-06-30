import express from "express";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import sharp from "sharp";
import { JSDOM } from "jsdom";
import YAML from "yaml";
import MarkdownIt from "markdown-it";
import front_matter_plugin from "markdown-it-front-matter";
import prism_plugin from "markdown-it-prism";
import webpack from "webpack";

// This config object is used to compile the JS that may be included in individual blog posts
const getWebpackConfig = (file, destination) => ({
  mode: "development",
  entry: file.path,
  resolve: {
    extensions: [".js"],
  },
  output: {
    filename: file.name,
    path: destination,
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: [
          {
            loader: "babel-loader",
            options: {
              presets: [
                "@babel/preset-env",
                ["@babel/preset-react", { runtime: "automatic" }],
              ],
            },
          },
        ],
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
});

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
  let title, description, date; // frontmatter

  const content = MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  })
    .use(
      front_matter_plugin,
      (frontmatter) => ({ title, description, date } = YAML.parse(frontmatter))
    )
    .use(prism_plugin)
    .render(md);

  return {
    title,
    description,
    date: new Date(date),
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

const origin = path.join(__dirname, "src", "content");
const destination = path.join(__dirname, "dist");

const fileTypes = [".md", ".js", ".png", ".jpg", ".jpeg", ".svg", ".gif"];

// Resolves to an object, each of whose properties is an array of files
const { md, js, img } = await getFileStructure(
  fileTypes.reduce((o, key) => ({ ...o, [key]: [] }), {}),
  origin
).then(({ ".md": md, ".js": js, ...img }) => {
  const _md = md.map(getFileContent);
  const _js = js.map((file) => webpack(getWebpackConfig(file, destination)));
  const _img = Object.keys(img)
    .reduce(function (paths, key) {
      return paths.concat(img[key]);
    }, [])
    .map(({ path: _path }) => ({
      path: path.relative(origin, _path),
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
    js: _js,
    img: _img,
  };
});

// Write the image files
img.forEach(({ path: _path, sharp }) =>
  fs
    .mkdir(path.join(destination, path.parse(_path).dir), {
      recursive: true,
    })
    .then(() => sharp.toFile(path.join(destination, _path)))
);

// Create the blog posts
const posts = await Promise.all(md)
  .then((x) =>
    x.map(({ content: blogPost, ...postData }) => ({
      ...postData,
      title: blogPost.title,
      date: blogPost.date,
      description: blogPost.description,
      content: JSDOM.fromFile(path.join(__dirname, "index.html"))
        .then((dom) => {
          const head = dom.window.document.querySelector("head");
          const favicon = dom.window.document.createElement("link");
          const faviconPath = path.relative(
            path.relative(
              path.join("src", "content"),
              path.parse(postData.path).dir
            ),
            path.join(__dirname, "favicon.ico")
          );

          favicon.href = faviconPath;
          favicon.rel = "icon";
          favicon.type = "image/x-icon";

          head.appendChild(favicon);

          const prismCSS = dom.window.document.createElement("link");

          prismCSS.rel = "stylesheet";
          prismCSS.href = path.relative(
            path.relative(
              path.join("src", "content"),
              path.parse(postData.path).dir
            ),
            path.join(__dirname, "prism.css")
          );

          head.appendChild(prismCSS);

          const indexCSS = dom.window.document.createElement("link");

          indexCSS.rel = "stylesheet";
          indexCSS.href = path.relative(
            path.relative(
              path.join("src", "content"),
              path.parse(postData.path).dir
            ),
            path.join(__dirname, "index.css")
          );

          head.appendChild(indexCSS);

          const siteName = dom.window.document.createElement("meta");
          const siteDescription = dom.window.document.createElement("meta");

          siteName.name = "title";
          siteName.content = blogPost.title;

          siteDescription.name = "description";
          siteDescription.content = blogPost.description;

          // FaceBook
          const ogName = dom.window.document.createElement("meta");
          const ogTitle = dom.window.document.createElement("meta");
          const ogDescription = dom.window.document.createElement("meta");
          const ogImg = dom.window.document.createElement("meta");
          const ogType = dom.window.document.createElement("meta");
          const ogTime = dom.window.document.createElement("meta");

          ogName.property = "og:site_name";
          ogName.content = "Xari.Dev -Ideas in Development";

          ogTitle.property = "og:title";
          ogTitle.content = blogPost.title;

          ogDescription.property = "og:description";
          ogDescription.content = blogPost.description;

          ogImg.property = "og:image";
          ogImg.itemprop = "image";
          ogImg.content = faviconPath;

          ogType.property = "og:type";
          ogType.content = "website";

          ogTime.property = "og:updated_time";
          ogTime.content = blogPost.date;

          head.appendChild(siteName);
          head.appendChild(siteTitle);
          head.appendChild(siteDescription);
          head.appendChild(siteImg);
          head.appendChild(siteType);
          head.appendChild(siteTime);

          // Google+
          const metaName = dom.window.document.createElement("meta");
          const metaDescription = dom.window.document.createElement("meta");
          const metaImage = dom.window.document.createElement("meta");

          metaName.itemprop = "name";
          metaName.content = blogPost.title;

          metaDescription.itemprop = "description";
          metaDescription.content = blogPost.description;

          metaImage.itemprop = "image";
          metaDescription.content = blogPost.faviconPath;

          return dom;
        })
        .then((dom) => {
          const titleAnchor = dom.window.document.createElement("a");

          titleAnchor.textContent = "Ideas in Development";
          titleAnchor.href = path.relative(
            path.relative(
              path.join("src", "content"),
              path.parse(postData.path).dir
            ),
            path.join(__dirname, "index.html")
          );

          dom.window.document.getElementById("title").replaceWith(titleAnchor);

          return dom;
        })
        .then((dom) => createBlogPage(dom)(blogPost))
        .then((dom) => dom.serialize()),
    }))
  )
  .then((x) =>
    x.map(async ({ name, path: src_path, content, ...details }) => {
      const destination_path = path.join(
        destination,
        path.relative(origin, path.parse(src_path).dir)
      );

      const url_path = fs
        .mkdir(destination_path, { recursive: true })
        .then(async () => {
          const destination_url = path.join(destination_path, `${name}.html`);

          return fs
            .writeFile(destination_url, await content)
            .then(() => destination_url);
        })
        .catch(console.error);

      return { path: path.relative(destination, await url_path), ...details };
    })
  );

// Create the front-page
Promise.all(posts)
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
    fs.writeFile(path.join(destination, "index.html"), await html)
  );
