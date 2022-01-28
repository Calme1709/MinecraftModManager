import app from "./app";

import getConfig from "@config";

//eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
	const port = (await getConfig()).ports.httpServer

	app.listen(process.env.PORT ?? port);
})();