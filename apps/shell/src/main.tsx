import { render } from "preact";
import { App } from "./App";
import { bootstrap } from "./services/bootstrap";
import "./styles.css";

const root = document.getElementById("app")!;

bootstrap()
  .then((services) => render(<App services={services} />, root))
  .catch((e: unknown) => {
    console.error(e);
    root.textContent = "ItsThatGame couldn't start. Please reinstall or contact support.";
  });
