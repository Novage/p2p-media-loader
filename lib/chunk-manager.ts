import LoaderInterface from "./loader-interface";

export default class ChunkManager {

    loader: LoaderInterface;

    constructor(loader: LoaderInterface) {
        this.loader = loader;
    }

}
