import getConfig from "@config";
import fs from "fs/promises";

export enum ModLocationType {
    GITHUB,
    CURSEFORGE
}

interface ICurseforgeModLocation {
    type: ModLocationType.CURSEFORGE;
    id: string;
}

export type ModLocation = ICurseforgeModLocation;

export default class RepositoryService {
    private static modLocations: Record<string, ModLocation | undefined> | undefined;

    public static async getModLocation(modName: string): Promise<ModLocation | undefined> {
        if (this.modLocations === undefined) {
            this.modLocations = JSON.parse(await fs.readFile((await getConfig()).repositoryLocation, "utf-8")) as Record<string, ModLocation | undefined>;
        }

        return this.modLocations[modName];
    }
}