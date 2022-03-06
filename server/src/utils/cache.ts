interface ICachedData<DataType> {
    cacheTime: number;
    value: DataType;
}

export default class Cache<DataType> {
    private data: Record<string, ICachedData<DataType> | undefined> = {};
    private cacheTimeout: number;

    public constructor(cacheTimeout: number) {
        this.cacheTimeout = cacheTimeout;
    }

    public get(key: string): DataType | null {
        const entry = this.data[key];

        if (entry === undefined || entry.cacheTime < Date.now() - this.cacheTimeout) {
            return null;
        } 

        return entry.value;
    }

    public set(key: string, value: DataType) {
        this.data[key] = {
            cacheTime: Date.now(),
            value
        };
    }
}