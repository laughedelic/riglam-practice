// Which project thread owns a PR. Two things name it:
//  - the attribution block a thread puts first in a PR body, whose link ends
//    in `?thread=cmsg_...`;
//  - the branch, which a thread opens as `claude/project-thread-<token>` with
//    a six-character token (and a suffix when it opens several).
// The names come from an owners file (a JSON object of key -> name, see
// README.md) and from `/pr-stacks owner <key> <name>`, kept in `$.store`.
// Without a name a PR shows its key: `thread <token>`.

export type Owners = Readonly<Record<string, string>>

const THREAD_IN_BODY = /[?&]thread=(cmsg_[A-Za-z0-9]+)/
const TOKEN_IN_BRANCH = /^claude\/project-thread-([a-z0-9]{6})(?:-|$)/

/** The keys a PR names its thread by: a thread id first, then a branch token. */
export function ownerKeys(body: string | null, branch: string): string[] {
  const keys: string[] = []
  const inBody = THREAD_IN_BODY.exec(body ?? '')
  if (inBody?.[1]) keys.push(inBody[1])
  const inBranch = TOKEN_IN_BRANCH.exec(branch)
  if (inBranch?.[1]) keys.push(inBranch[1])
  return keys
}

export function ownerOf(
  body: string | null,
  branch: string,
  owners: Owners,
): { owner: string; key: string } {
  // The release PR is opened by a workflow, not by a thread.
  if (branch.startsWith('release-please--')) {
    return { owner: 'release-please', key: 'release-please' }
  }
  const keys = ownerKeys(body, branch)
  for (const key of keys) {
    const name = owners[key]
    if (name) return { owner: name, key }
  }
  const key = keys[keys.length - 1] ?? ''
  const short = key.startsWith('cmsg_') ? key.slice(-6) : key
  return { owner: short ? `thread ${short}` : 'unassigned', key }
}

/** Reads an owners file's text: a JSON object of strings; anything else is ignored. */
export function parseOwners(text: string): Record<string, string> {
  try {
    const data: unknown = JSON.parse(text)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    return Object.fromEntries(
      Object.entries(data).filter((pair): pair is [string, string] => typeof pair[1] === 'string'),
    )
  } catch {
    return {}
  }
}
