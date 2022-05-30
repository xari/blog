module.exports = {
  content: ["./index.html", "./index.js", "./src/**/*.{md, html,js}"],
  theme: {
    fontFamily: {
      sans: ["ui-sans-serif", "system-ui"],
      serif: ["ui-serif", "Georgia"],
      mono: ["ui-monospace", "SFMono-Regular"],
      display: ['"Rosario"'],
      body: ['"Crimson Pro"', "ui-serif"],
    },
    borderWidth: {
      DEFAULT: "1px",
      0: "0",
      2: "2px",
      4: "4px",
      8: "8px",
      30: "30px",
      50: "50px",
    },
  },
  plugins: [],
};
