import { readdir, PathLike, readFile, unlinkSync,  } from "fs";

export async function getFiles(path: PathLike): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        readdir(path, (err, files) => {
            if (err) {
                reject(err);
            }
            resolve(files)
        });
    });
}

export async function getFilesFromType(path: PathLike, type: string): Promise<string[]> {
    try {
        const files = await getFiles(`${path}`);
        const typedFiles = files.filter((file) => {
            return file.indexOf(type) >= 0;
        });
        return typedFiles;
    } catch (error) {
        throw error;
    }
}

export async function loadFile(path: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        readFile(path, (err, file) => {
            if (err) {
                reject(err);
            }
            resolve(file);
        });
    });
}

export async function removeAllFilesInFolder(path: string): Promise<void> {
    let files = await getFiles(path);
    for (const file of files) {
        try {
            unlinkSync(`${path}/${file}`);
        } catch (error) {
            console.error(error);
        }
    }
    return;
}
