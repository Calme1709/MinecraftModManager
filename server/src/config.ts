import fs from "fs/promises";

interface IConfig {
    repositoryLocation: string;
    curseForgeApiKey: string;
    cacheLength: number;
    ports: {
        httpServer: number;
    }
}

let config: IConfig | undefined;

const getConfig = async () => {
    if (config === undefined) {
        config = JSON.parse(await fs.readFile("./config.json", "utf-8")) as IConfig;
    }

    return config;
}

export default getConfig;