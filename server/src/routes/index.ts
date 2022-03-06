import { ModService } from "@services";
import { ControlledError, successfulResponse, unsuccessfulResponse } from "@utils";
import { Router as expressRouter } from "express";

const router = expressRouter();

//eslint-disable-next-line @typescript-eslint/no-misused-promises
router.get("/latestVersion", async (req, res, next) => {
	const modsQuery = req.query.mods;

	if(typeof modsQuery === "string") {
		const notInRepository: string[] = [];
		const versions: Record<string, { version: string; downloadUrl: string }> = {};

		await Promise.all(modsQuery
			.split(",")
			.map(modName => ModService.getLatestVersion(req.query.mc_version as string, modName)
				.then(versionInfo => {
					versions[modName] = versionInfo;
				})
				.catch((err: ControlledError) => {
					if(err.httpCode === 404) {
						notInRepository.push(modName);
					} else {
						next(err);
					}
				})));

		res.status(200).json(successfulResponse({ versions, notInRepository }));

		return;
	}

	res.status(400).json(unsuccessfulResponse("Invalid type for mods query parameter"));
});

router.get("/client", (_, res) => {
	res.download(`/opt/mod_manager/mod-manager.py`);
})

router.get("/", ({}, res) => res.send("Minecraft Mod Manager"));

export default router;