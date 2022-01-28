import { ModModel, ModLocation } from "models";
import { Octokit } from "@octokit/core";
import https from "https";
import fs from "fs";
import { execSync } from "child_process";
import os from "os";
import { ControlledError } from "@utils";
import getConfig from "@config";

export interface ICurseForgeModFileListResponse {
	data: IFile[];
}

export interface IFile {
	fileDate: string;
	downloadUrl: string;
	gameVersions: string[];
}

/**
 * Calculate the minor version from a more specific version e.g. 1.18 from 1.18.1.
 *
 * @param version - The version to calculate it from.
 * @returns - The minor version.
 */
const minorVersion = (version: string) => version.split(".").slice(0, 2).join(".");

/**
 * The mod service, handles all interactions with mods.
 */
export default class ModService {
	private static readonly octokit = new Octokit();

	/**
	 * Get the latest version of a mod according to it's name.
	 *
	 * @param minecraftVersion - The version of minecraft to limit the mod versions to.
	 * @param modName - The name of the mod.
	 * @returns The latest version of the mod that is available.
	 */
	public static async getLatestVersion(minecraftVersion: string, modName: string) {
		console.log(`Getting latest version information for ${modName}`);
		const mod = await ModModel.getMod(modName).catch(err => {
			throw err;
		});

		if(mod.data.cacheTime + (await getConfig()).cacheLength < Date.now()) {
			let latestVersion: { version: string; downloadUrl: string };

			switch (mod.data.remoteLocation.type) {
				case ModLocation.GITHUB:
					latestVersion = await this.fetchLatestVersionFromGithub(
						mod.data.remoteLocation.owner,
						mod.data.remoteLocation.repo,
						mod.data.remoteLocation.assetNumber
					);
					break;
				case ModLocation.CURSEFORGE:
					latestVersion = await this.fetchLatestVersionFromCurseForge(minecraftVersion, mod.data.remoteLocation.id);
					break;
				default:
					throw new Error(`Unsupported remote location for mod ${modName}`);
			}

			mod.data.latestVersion = latestVersion;
			mod.data.cacheTime = Date.now();

			await mod.save();
		}

		return mod.data.latestVersion;
	}

	/**
	 * Get the most recent version from github.
	 *
	 * @param owner - The owner of the github repository.
	 * @param repo - The name of the github repository.
	 * @param assetNumber - The index of the mod .jar in the assets.
	 * @returns The latest version available.
	 */
	private static async fetchLatestVersionFromGithub(owner: string, repo: string, assetNumber: number) {
		const releaseData = await this.octokit.request("GET /repos/{owner}/{repo}/releases", {
			owner,
			repo
		});

		const downloadUrl = releaseData.data[0].assets[assetNumber].browser_download_url;

		const version = await this.fetchVersionFromDownloadUrl(downloadUrl);

		return { version, downloadUrl };
	}

	/**
	 * Get the most recent version from curseforge.
	 *
	 * @param minecraftVersion - The minecraft version to limit mod downloads to.
	 * @param id - The id of the curseforge page.
	 * @returns The latest version available.
	 */
	private static async fetchLatestVersionFromCurseForge(minecraftVersion: string, id: string) {
		const response = await new Promise<ICurseForgeModFileListResponse>(async (resolve, reject) => {
			https.get(`https://api.curseforge.com/v1/mods/${id}/files?pageSize=1000`, { headers: { "x-api-key": (await getConfig()).curseForgeApiKey } }, (res => {
				let data = "";

				res.on("data", chunk => {
					data += chunk;
				});

				res.on("error", reject);

				res.on("end", async () => {
					resolve(JSON.parse(data));
				});
			}));
		});

		const filteredFiles = response.data
			.filter(file => file.gameVersions.includes("Fabric") && (file.gameVersions.includes(minecraftVersion) || file.gameVersions.includes(minorVersion(minecraftVersion))))
			.sort((a, b) => {
				if(a.fileDate === b.fileDate) {
					return 0;
				}

				return a < b ? -1 : 1;
			})
			.map(file => file.downloadUrl);

		if(filteredFiles.length === 0) {
			throw new ControlledError(404, "Could not find a suitable file on curseforge");
		}

		const version = (await this.fetchVersionFromDownloadUrl(filteredFiles[0]))
			.split(".")
			.map(portion => (portion === "0" ? portion : portion.replace(/^0+(\d+)/, "$1")))
			.join(".");

		return { version, downloadUrl: filteredFiles[0] };
	}

	/**
	 * Fetch the version of a fabric mod from the .jar file.
	 *
	 * @param url - The URL of the mod's most recent .jar file.
	 * @returns The version.
	 */
	private static async fetchVersionFromDownloadUrl(url: string) {
		const dir = await fs.promises.mkdtemp(`${os.tmpdir()}/mod-manager-`);
		const path = `${dir}/mod.jar`;

		await this.downloadWithRedirects(url, path);

		execSync(`unzip -d ${dir} ${path}`);

		const modInfo = JSON.parse(await fs.promises.readFile(`${dir}/fabric.mod.json`, "utf-8")) as { "version": string };

		await fs.promises.rm(dir, { recursive: true, force: true });

		return modInfo.version;
	}

	/**
	 * Download a file and account for HTTP redirects in the process.
	 *
	 * @param url - The URL to download.
	 * @param path - The path to download the file to.
	 * @returns - A promise that resolves when the file is downloaded.
	 */
	private static downloadWithRedirects(url: string, path: string) {
		return new Promise<void>((resolve, reject) => {
			https.get(url, res => {
				if(res.headers.location === undefined) {
					const stream = fs.createWriteStream(path);
					res.pipe(stream);

					stream.on("error", err => {
						reject(err);
					});

					stream.on("finish", () => {
						resolve();
					});
				} else {
					this.downloadWithRedirects(res.headers.location, path)
						.then(resolve)
						.catch(reject);
				}
			});
		});
	}
}
