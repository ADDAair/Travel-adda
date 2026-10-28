# Passwords of the two CI test accounts (haji 01300000001, leader 01300000003). Source this file in a workflow step.
# Old scheme: derived from the repository id only (anyone with the code + id could log in as the test leader).
# New scheme: derived from the GitHub secret CI_TEST_SECRET (never in the code). tests/ci_rotate.mjs moves the
# accounts from the old to the new password automatically the first time the secret exists.
old_pw() { echo "ci-$(echo -n "${GITHUB_REPOSITORY_ID}-travel-adda-$1" | sha256sum | cut -c1-24)"; }
new_pw() { echo "ci-$(echo -n "${CI_TEST_SECRET}-$1" | sha256sum | cut -c1-32)"; }
export H_PHONE=01300000001 L_PHONE=01300000003
export H_OLD_PW="$(old_pw screens)" L_OLD_PW="$(old_pw leader2)"
if [ -n "${CI_TEST_SECRET:-}" ]; then
  export H_PW="$(new_pw haji)" L_PW="$(new_pw leader)"
else
  echo "::warning title=CI_TEST_SECRET not set::test accounts still use the old password scheme"
  export H_PW="$H_OLD_PW" L_PW="$L_OLD_PW"
fi
export TEST_PHONE="$H_PHONE" TEST_PW="$H_PW"
# GitHub hides secrets in logs, but not passwords made FROM a secret: hide them too (the code is public).
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  echo "::add-mask::$H_PW"; echo "::add-mask::$L_PW"; echo "::add-mask::$H_OLD_PW"; echo "::add-mask::$L_OLD_PW"
fi
