function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function extractCall(source: string, callee: string): string {
  const callIndex = source.indexOf(callee);
  assert(callIndex !== -1, `${callee} call should exist`);
  const openIndex = source.indexOf("(", callIndex);
  assert(openIndex !== -1, `${callee} call should have an argument list`);

  let depth = 1;
  let quote: '"' | "'" | "`" | undefined;
  let escaped = false;

  for (let index = openIndex + 1; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "{" || char === "[") {
      depth++;
      continue;
    }
    if (char === ")" || char === "}" || char === "]") {
      depth--;
      if (depth === 0) {
        return source.substring(openIndex + 1, index);
      }
    }
  }

  throw new Error(`${callee} call should have a closing parenthesis`);
}

function countTopLevelArguments(argumentSource: string): number {
  if (argumentSource.trim() === "") return 0;

  let depth = 0;
  let count = 1;
  let quote: '"' | "'" | "`" | undefined;
  let escaped = false;

  for (let index = 0; index < argumentSource.length; index++) {
    const char = argumentSource[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "{" || char === "[") {
      depth++;
      continue;
    }
    if (char === ")" || char === "}" || char === "]") {
      depth--;
      continue;
    }
    if (char === "," && depth === 0) {
      count++;
    }
  }

  return count;
}

Deno.test("PeerCouchDB.start does not reintroduce pre-decryption remote-path filtering", async () => {
  const source = await Deno.readTextFile("./PeerCouchDB.ts");
  const beginWatchArguments = extractCall(source, "this.man.beginWatch");

  assert(
    countTopLevelArguments(beginWatchArguments) === 1,
    "beginWatch must receive only the reconstructed-entry callback, not a pre-decryption checkIsInterested filter",
  );
  assert(
    !beginWatchArguments.includes("checkIsInterested"),
    "PeerCouchDB must not pass checkIsInterested to beginWatch because raw obfuscated paths can contain ':'",
  );

  const checkpointIndex = beginWatchArguments.indexOf(
    'this.setSetting("since"',
  );
  const colonFilterIndex = beginWatchArguments.indexOf(
    'entry.path.indexOf(":")',
  );
  const baseDirFilterIndex = beginWatchArguments.indexOf(
    "entry.path.startsWith(baseDir)",
  );

  assert(
    checkpointIndex !== -1,
    "watch callback should store the since checkpoint from the callback seq",
  );
  assert(
    colonFilterIndex !== -1,
    "watch callback should still filter unresolved or prefixed reconstructed paths",
  );
  assert(
    baseDirFilterIndex !== -1,
    "watch callback should filter reconstructed paths outside baseDir",
  );
  assert(
    checkpointIndex < colonFilterIndex && checkpointIndex < baseDirFilterIndex,
    "since checkpoint should be stored before post-reconstruction path filters skip an entry",
  );
});
