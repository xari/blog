import express from "express";
import { mkdirSync, promises as fs } from "fs";
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
    const small = dom.window.document.createElement("small");
    const time = dom.window.document.createElement("time");
    const section = dom.window.document.createElement("section");
    const p = dom.window.document.createElement("p");

    article.classList.add("blog-preview");

    anchor.href = path;
    anchor.textContent = title;

    time.datetime = date;
    time.textContent = date.toDateString();

    p.textContent = description;

    heading.appendChild(anchor);
    small.appendChild(time);
    header.appendChild(heading);
    header.appendChild(small);
    section.appendChild(p);
    article.appendChild(header);
    article.appendChild(section);

    return article;
  };
}

function createBlogPage(dom) {
  return (blogPost) => {
    const titleAnchor = dom.window.document.createElement("a");

    titleAnchor.textContent = "Ideas in Development";
    titleAnchor.href = "https://www.xari.dev";

    dom.window.document.getElementById("title").replaceWith(titleAnchor);

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

    const head = dom.window.document.querySelector("head");
    const indexCSS = dom.window.document.createElement("link");
    const prismCSS = dom.window.document.createElement("link");

    indexCSS.rel = "stylesheet";
    indexCSS.href = path.join(__dirname, "index.css");

    head.appendChild(indexCSS);

    prismCSS.rel = "stylesheet";
    prismCSS.href = path.join(__dirname, "prism.css");

    head.appendChild(prismCSS);

    return dom;
  };
}

function createIndexTitle(dom) {
  const titleHeading = dom.window.document.createElement("h1");
  const titleAnchor = dom.window.document.createElement("a");

  titleHeading.classList.add("index-title");

  titleAnchor.textContent = "Ideas in Development";
  titleAnchor.href = "https://www.xari.dev";

  titleHeading.appendChild(titleAnchor);
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
      sharp: sharp(_path).resize({
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
img.forEach(({ path: _path, sharp }) => {
  mkdirSync(path.join(destination, path.parse(_path).dir), {
    recursive: true,
  });

  sharp.toFile(path.join(destination, _path));
});

// Create the blog posts
const posts = await Promise.all(md)
  .then((x) =>
    x.map(({ content: blogPost, ...postData }) => ({
      ...postData,
      title: blogPost.title,
      date: blogPost.date,
      description: blogPost.description,
      content: JSDOM.fromFile(path.join(__dirname, "index.html"))
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

      mkdirSync(destination_path, { recursive: true });
      fs.writeFile(`${path.join(destination_path, name)}.html`, await content);

      return { path: path.relative(destination, destination_path), ...details };
    })
  );

// Create the front-page
Promise.all(posts)
  .then((x) =>
    JSDOM.fromFile(path.join(__dirname, "index.html"))
      .then((dom) => {
        const head = dom.window.document.querySelector("head");
        const indexCSS = dom.window.document.createElement("link");

        indexCSS.rel = "stylesheet";
        indexCSS.href = path.join(__dirname, "index.css");

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
