<!--
Thanks for the pull request. Keep it to one thing where you can: a rename and a bug fix in the
same diff take far longer to review than two pull requests.
-->

## What this changes

<!-- One or two sentences. If it closes an issue, write "Closes #123". -->

## Why

<!-- What was wrong, or what this makes possible. -->

## How to check it

<!-- The quickest way for a reviewer to see it working. A GitHub handle that reproduces the old
     behaviour is usually enough. -->

## Checklist

- [ ] `php artisan test` passes
- [ ] `./vendor/bin/pint --test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` was run, if anything under `resources/` changed
- [ ] Behaviour changes have a test, or there is a note below saying why not
- [ ] No assets added that the project has no right to redistribute (see [NOTICE.md](../NOTICE.md))

## Notes for the reviewer

<!-- Anything you are unsure about, deliberately left out, or want a second opinion on. -->
