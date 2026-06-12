import { DirectFileManipulator, type FileInfo } from "../lib/src/API/DirectFileManipulatorV2.ts";
import { MILESTONE_DOCID, type TweakValues } from "../lib/src/common/types.ts";
import { createBinaryBlob, createTextBlob } from "../lib/src/common/utils.ts";
import { isPlainText } from "../lib/src/string_and_binary/path.ts";
import type { Config, PeerCouchDBConf, PeerStorageConf } from "../types.ts";

const configPath = Deno.env.get("LSB_CONFIG") ?? "./dat/config.json";
const targetPath = Deno.args[0];

if (!targetPath) {
    console.error("Usage: deno run --allow-read --allow-net script/repair-doc-from-filesystem.ts <vault-relative-path>");
    Deno.exit(2);
}

const config = JSON.parse(await Deno.readTextFile(configPath)) as Config;
const couch = config.peers.find((peer): peer is PeerCouchDBConf => peer.type === "couchdb");
const storage = config.peers.find((peer): peer is PeerStorageConf => peer.type === "storage");

if (!couch || !storage) {
    console.error("Config must include one couchdb peer and one storage peer.");
    Deno.exit(2);
}

const filesystemPath = `${storage.baseDir.replace(/\/+$/, "")}/${targetPath}`;
const stat = await Deno.stat(filesystemPath);
if (!stat.isFile) {
    console.error(`Not a file: ${filesystemPath}`);
    Deno.exit(2);
}

const man = new DirectFileManipulator(couch);
await man.ready.promise;

const milestone = await man.rawGet<Record<string, unknown>>(MILESTONE_DOCID);
if (couch.useRemoteTweaks && milestone && "tweak_values" in milestone) {
    const tweaks = Object.values(milestone.tweak_values as Record<string, TweakValues>)[0];
    couch.customChunkSize = tweaks.customChunkSize ?? couch.customChunkSize;
    couch.minimumChunkSize = tweaks.minimumChunkSize ?? couch.minimumChunkSize;
    couch.hashAlg = tweaks.hashAlg ?? couch.hashAlg;
    couch.maxAgeInEden = tweaks.maxAgeInEden ?? couch.maxAgeInEden;
    couch.maxTotalLengthInEden = tweaks.maxTotalLengthInEden ?? couch.maxTotalLengthInEden;
    couch.maxChunksInEden = tweaks.maxChunksInEden ?? couch.maxChunksInEden;
    couch.useEden = tweaks.useEden ?? couch.useEden;
    couch.useDynamicIterationCount = tweaks.useDynamicIterationCount ?? couch.useDynamicIterationCount;
    couch.enableChunkSplitterV2 = tweaks.enableChunkSplitterV2 ?? couch.enableChunkSplitterV2;
    couch.chunkSplitterVersion = tweaks.chunkSplitterVersion ?? couch.chunkSplitterVersion;
    couch.E2EEAlgorithm = tweaks.E2EEAlgorithm ?? couch.E2EEAlgorithm;
    couch.doNotUseFixedRevisionForChunks = tweaks.doNotUseFixedRevisionForChunks ?? couch.doNotUseFixedRevisionForChunks;
    couch.handleFilenameCaseSensitive = tweaks.handleFilenameCaseSensitive ?? couch.handleFilenameCaseSensitive;
    man.options = couch;
    await man.liveSyncLocalDB.initializeDatabase();
}

const info: FileInfo = {
    ctime: stat.mtime?.getTime() ?? 0,
    mtime: stat.mtime?.getTime() ?? 0,
    size: stat.size,
};
const data = isPlainText(targetPath)
    ? createTextBlob([await Deno.readTextFile(filesystemPath)])
    : createBinaryBlob(await Deno.readFile(filesystemPath));

console.log(`Repairing ${targetPath} from filesystem (${stat.size} bytes)`);
const written = await man.put(targetPath, data, info);
if (!written) {
    console.error(`Repair write failed: ${targetPath}`);
    Deno.exit(1);
}

const verified = await man.get(targetPath);
if (!verified || verified.size !== stat.size) {
    console.error(`Repair verification failed: ${targetPath}`);
    Deno.exit(1);
}

console.log(`Repair verified: ${targetPath}`);
Deno.exit(0);
