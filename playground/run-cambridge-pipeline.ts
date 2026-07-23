import { collectCambridgeSubject } from "../apps/worker/src/jobs/cambridge/index.js";

const main = async () => {
  await collectCambridgeSubject(
    "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-physics-0625/",
  );
};

main().catch((error) => console.error(error));
