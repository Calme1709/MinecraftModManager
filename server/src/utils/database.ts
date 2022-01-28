import getConfig from "@config";
import { existsSync } from "fs";
import fs from "fs/promises";

/**
 * Handles all interactions with the MongoDB database.
 */
export default class Database {
	private static data?: Record<string, unknown[]>;
	private static databaseLocation?: string;

	/**
	 * Get a collection from the database.
	 *
	 * @param collectionName - The collection to get.
	 *
	 * @returns The collection.
	 */
	public static async getCollection<T>(collectionName: string): Promise<T> {
		const data = await this.getData();

		if(!(collectionName in data)) {
			data[collectionName] = {};
		}

		return data[collectionName] as T;
	}

	/**
	 * Save a collection.
	 *
	 * @returns - A promise that resolves when the.
	 */
	public static async save() {
		await fs.writeFile(await this.getDatabaseLocation(), JSON.stringify(this.data), "utf-8");
	}

	/**
	 * Get the data, either from the cache or from the filesystem.
	 *
	 * @returns - The data stored in the database.
	 */
	private static async getData(): Promise<Record<string, any>> {
		if(this.data === undefined) {
			if(existsSync(await this.getDatabaseLocation())) {
				this.data = JSON.parse(await fs.readFile(await this.getDatabaseLocation(), "utf-8")) as Record<string, unknown[]>;
			} else {
				this.data = {};
			}
		}

		return this.data;
	}

	private static async getDatabaseLocation() {
		if (this.databaseLocation === undefined) {
			this.databaseLocation = (await getConfig()).databaseLocation;
		}

		return this.databaseLocation;
	}
}
