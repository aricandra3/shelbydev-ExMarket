/// Startup checks for server-only configuration.
///
/// A missing API key does not fail loudly — it just makes every upstream call
/// anonymous, which shows up much later as rate limiting or rejected uploads.
/// Worse, the same value under a NEXT_PUBLIC_ name is both invisible to the
/// server and shipped to browsers, so the mistake is silent in both directions.
/// Say so at boot instead.

let reported = false;

type KeyCheck = {
    name: string;
    value: string;
    purpose: string;
};

export function warnAboutMisplacedKeys(checks: KeyCheck[]) {
    if (reported) return;
    reported = true;

    checks.forEach(({ name, value, purpose }) => {
        if (value) return;

        const publicName = `NEXT_PUBLIC_${name}`;
        const publicValue = process.env[publicName];

        if (publicValue) {
            console.error(
                `${name} is not set, but ${publicName} is. Rename it: NEXT_PUBLIC_ variables ` +
                    `are inlined into the browser bundle, and server code does not read them. ` +
                    `Until then, ${purpose} runs unauthenticated.`
            );
        } else {
            console.warn(
                `${name} is not set — ${purpose} runs unauthenticated and will hit anonymous rate limits.`
            );
        }
    });
}
