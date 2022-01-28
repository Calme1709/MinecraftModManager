import { Database, ControlledError } from "@utils";

/**
 * An enum of the services which we query for the latest version and the client will later download from.
 */
export enum ModLocation {

	/**
	 * For mods that are released through the Github release feature. This should only be used if Curseforge is not possible.
	 */
	GITHUB = 0,

	/**
	 * For mods that are released through curseforge. This should be used when possible.
	 */
	CURSEFORGE = 1
}

interface IRemoteLocation {
	type: ModLocation;
}

interface ICurseforgeRemoteLocation extends IRemoteLocation {
	type: ModLocation.CURSEFORGE;
	id: string;
}

interface IGithubRemoteLocation extends IRemoteLocation {
	type: ModLocation.GITHUB;
	owner: string;
	repo: string;
	assetNumber: number;
}

export interface IModDatabaseEntry {
	cacheTime: number;
	latestVersion: { version: string; downloadUrl: string };
	remoteLocation: IGithubRemoteLocation | ICurseforgeRemoteLocation;
}

export interface IModData extends IModDatabaseEntry {
	name: string;
}

/**
 * Used for all interactions with mods in the database.
 */
export default class ModModel {
	public readonly data: IModData;

	/**
	 * Create a new mod model.
	 *
	 * @param data - The data to create the new mod model with.
	 */
	public constructor(data: IModData) {
		this.data = data;
	}

	/**
	 * Get a server by it's name.
	 *
	 * @param name - The id of the server to get.
	 * @returns The server.
	 */
	public static async getMod(name: string) {
		const mod = (await this.getCollection())[name];

		if(mod === undefined) {
			throw new ControlledError(404, `Mod with name ${name} is not in the repository`);
		}

		return new ModModel({ name, ...mod });
	}

	/**
	 * Check if a mod with the given name exists.
	 *
	 * @param name - The ID to check.
	 * @returns Whether the mod exists.
	 */
	 public static modExists(name: string) {
		return new Promise<boolean>(resolve => {
			this.getMod(name)
				.then(() => resolve(true))
				.catch(() => resolve(false));
		});
	}

	/**
	 * Get the MongoDB database collection.
	 *
	 * @returns The collection.
	 */
	private static getCollection() {
		return Database.getCollection<Record<string, IModDatabaseEntry>>("Mods");
	}

	/**
	 * Save the changes that have been made to the database.
	 */
	public async save() {
		const collection = await ModModel.getCollection();

		const { name, ...rest } = this.data;

		collection[name] = rest;

		await Database.save();
	}
}