#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sigForms = void 0;
exports.normalizeAlias = normalizeAlias;
exports.applySignatureRow = applySignatureRow;
exports.restoreSignatureRow = restoreSignatureRow;
exports.signatureLine = signatureLine;
exports.setSignature = setSignature;
exports.showSignature = showSignature;
// Project signature: a short alias the user chooses at install (or chooses not to have). It is a watermark: code written
// to the standards carries it in three places, so compliance is visible and checkable. The kit never picks one itself.
//   selectors and ids  `abc-name`   data attributes  `data-abc-name`   (css-standards.md RULE 11)
//   shared components  `AbcName`
// The alias is stored once in .ai-dev-kit.json and written to the project table's "Selector signature" row. The row's
// original text is kept so removing the signature puts it back. code-audit reads the stored alias (rule css-11).
// No network, no dependencies.
const fs = require("node:fs");
const path = require("node:path");
const skill_scope_move_1 = require("./skill-scope.move");
const sigForms = (alias) => ({ selector: `${alias}-`, data: `data-${alias}-`, component: alias[0].toUpperCase() + alias.slice(1) });
exports.sigForms = sigForms;
// 2 to 6 letters or digits, starting with a letter. A trailing dash and capitals are accepted and normalised.
function normalizeAlias(s) {
    const v = s.trim().toLowerCase().replace(/-+$/, '');
    if (!/^[a-z][a-z0-9]{1,5}$/.test(v))
        throw new Error(`the signature must be 2 to 6 letters or digits starting with a letter, like abc (got "${s}")`);
    return v;
}
const SIG_ROW = /^\|[ \t]*Selector signature[ \t]*\|[^\n]*$/m;
const sigRow = (alias) => {
    const f = (0, exports.sigForms)(alias);
    return `| Selector signature | \`${f.selector}\` (set at install: data attributes \`${f.data}\`, shared components \`${f.component}\`) |`;
};
function applySignatureRow(body, alias, original) {
    const m = SIG_ROW.exec(body);
    if (!m)
        return { body, original };
    const mine = sigRow(alias);
    if (m[0] === mine)
        return { body, original };
    return { body: body.replace(SIG_ROW, () => mine), original: original ?? m[0] };
}
function restoreSignatureRow(body, original) {
    return SIG_ROW.test(body) ? body.replace(SIG_ROW, () => original) : body;
}
function signatureLine(alias) {
    const f = (0, exports.sigForms)(alias);
    return `**Signature \`${alias}\`** (chosen at install): every class and id this project defines starts with \`${f.selector}\`, every data attribute with \`${f.data}\`, every shared UI component with \`${f.component}\` (\`css-standards.md\` RULE 11). Never choose another. This covers the project's own code only: never rename, prefix or restyle a class, attribute or component that comes from a package, framework or library (btn, col-6, swiper-slide, data-bs-toggle).`;
}
// set: store the alias and fill the project table row. none or remove: put the row back and forget the alias.
function setSignature(root, aliasOrNone, dryRun = false) {
    const manifest = (0, skill_scope_move_1.readManifest)(root);
    const protocol = manifest.protocolFile || 'CLAUDE.md';
    const abs = path.join(root, protocol);
    const notes = [];
    const none = /^(none|off|no)$/i.test(aliasOrNone.trim());
    if (none) {
        const prev = manifest.signature;
        if (!prev) {
            notes.push('no signature was set: nothing to remove');
            return { alias: null, notes };
        }
        if (dryRun) {
            notes.push('dry run: nothing was written', `would remove the signature ${prev.alias} and restore the "Selector signature" row`);
            return { alias: prev.alias, notes };
        }
        if (prev.row && fs.existsSync(abs))
            fs.writeFileSync(abs, restoreSignatureRow(fs.readFileSync(abs, 'utf8'), prev.row));
        delete manifest.signature;
        (0, skill_scope_move_1.writeManifest)(root, manifest);
        notes.push(`signature ${prev.alias} removed; the "Selector signature" row is back as it was`);
        return { alias: null, notes };
    }
    const alias = normalizeAlias(aliasOrNone);
    const f = (0, exports.sigForms)(alias);
    if (dryRun) {
        notes.push('dry run: nothing was written', `would set the signature ${alias}: ${f.selector} classes and ids, ${f.data} data attributes, ${f.component} components`);
        return { alias, notes };
    }
    let row = manifest.signature?.row;
    if (fs.existsSync(abs)) {
        const r = applySignatureRow(fs.readFileSync(abs, 'utf8'), alias, row);
        fs.writeFileSync(abs, r.body);
        row = r.original;
        if (r.original === undefined && !SIG_ROW.test(r.body))
            notes.push(`${protocol} has no "Selector signature" row: the alias is stored and checked, but add the row by hand if you want it listed there`);
    }
    else
        notes.push(`${protocol} does not exist yet: the alias is stored; the row is filled the next time the standards are installed`);
    manifest.signature = { alias, row };
    (0, skill_scope_move_1.writeManifest)(root, manifest);
    notes.push(`signature ${alias}: ${f.selector} classes and ids, ${f.data} data attributes, ${f.component} components`);
    return { alias, notes };
}
function showSignature(root) {
    return { alias: (0, skill_scope_move_1.readManifest)(root).signature?.alias ?? null };
}
