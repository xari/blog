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

function blogPreview({ title, description, date, path }) {
  const link = `<a href=${path}>${title}</a>`;
  const time = `<time datetime="${date}">${DateTime.fromISO(
    date
  ).toLocaleString(DateTime.DATE_FULL)}</time>`;

  return `<blog-preview>
<span slot="link">${link}</span>
<span slot="date">${time}</span>
<span slot="description">${description}</span>
  </blog-preview>`;
}

function blogPost({ title, description, date, content }) {
  const time = `<time datetime="${date}">${DateTime.fromISO(
    date
  ).toLocaleString(DateTime.DATE_FULL)}</time>`;

  return `<blog-post>
<span slot="title">${title}</span>
<span slot="date">${time}</span>
<span slot="content">${content}</span>
  </blog-post>`;
}

function previewWrapper(content) {
  return `<preview-wrapper>
<span slot="content">${content}</span>
  </preview-wrapper>`;
}

function blogPostWrapper(content) {
  return `<blog-wrapper>
<span slot="content">${content}</span>
  </blog-wrapper>`;
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

function handleImg(origin, destination) {
  sharp(origin)
    .resize({
      width: 600,
      fit: "inside",
    })
    .toFile(destination);
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
              ...(await acc),
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
  const blogContent = await fs
    .readFile(file.path, "utf8")
    .then(parsePost)
    .then((postData) => ({
      ...postData,
      content: blogPostWrapper(blogPost(postData)),
    }));

  return {
    ...file,
    content: blogContent,
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
    .map(({ path }) => {
      return sharp(path).resize({
        width: 600,
        fit: "inside",
      });
    });

  return {
    md: _md,
    js: _js,
    img: _img,
  };
});

// Create the blog posts
const posts = await Promise.all(md)
  .then((x) =>
    x.map(({ content: blogPost, ...postData }) => ({
      ...postData,
      title: blogPost.title,
      date: blogPost.date,
      description: blogPost.description,
      content: JSDOM.fromFile(path.join(__dirname, "index.html")).then(
        (dom) => {
          dom.window.document.getElementById("content").innerHTML =
            blogPost.content;

          return dom.serialize();
        }
      ),
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
    JSDOM.fromFile(path.join(__dirname, "index.html")).then((dom) => {
      dom.window.document.getElementById("content").innerHTML = previewWrapper(
        x.map(blogPreview)
      );

      return dom.serialize();
    })
  )
  .then(async (html) =>
    fs.writeFile(path.join(destination, "index.html"), await html)
  );

// Compile the JS
// js.forEach((compiler) =>
//   compiler.run((err, stats) => {
//     if (err || stats.hasErrors()) {
//       console.log(err, stats);
//     }
//
//     compiler.close(console.error);
//   })
// );

// Write the images
// img.forEach((x) => x.toFile(destination));

// Promise.all(files[".md"]).then(console.log);

// dateString: DateTime.fromISO(date).toLocaleString(DateTime.DATE_FULL),

// const withContent = files.map(getFileContent);

// files.Promise.all(files)
//   .then((obj) => {
//     fs.writeFile(
//       `${path.join(destination, path.parse(file.name).name)}.json`,
//       JSON.stringify(obj)
//     );
//
//     return obj;
//   })
//   .then((x) => {
//     return x
//       .reduce((acc, cur) => {
//         const { content, ...rest } = cur; // Remove "content" property
//
//         !Object.values(rest).includes(undefined) ? rest : null; // Remove whole object if any fields are undefined
//
//         return [...acc, rest];
//       }, [])
//       .sort((a, b) => b.date - a.date);
//   })
//   .then((x) =>
//     x.reduce((acc, cur) => {
//       return acc.concat(blogPreview(cur));
//     }, "")
//   )
//   .then(previewWrapper)
//   .then((html) =>
//     JSDOM.fromFile(path.join(__dirname, "index.html")).then((dom) => {
//       dom.window.document.getElementById("content").innerHTML = html;
//
//       return dom.serialize();
//     })
//   )
//   .then((html) => fs.writeFile(path.join(destination, "index.html"), html));
