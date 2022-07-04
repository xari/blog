import React from "react";
import { createRoot } from "react-dom/client";
import App from "sonar-interview-react-app/src/App.js";

const domContainer = document.querySelector("#app-container");
const root = createRoot(domContainer);

root.render(React.createElement(App));
