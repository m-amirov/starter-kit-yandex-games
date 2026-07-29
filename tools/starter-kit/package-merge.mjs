function compareNumericVersion(left, right) {
  const parse = (value) => String(value).replace(/^[^\d]*/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

export function planPackageMerge(source, target, options = {}) {
  const value = structuredClone(target ?? {});
  const conflicts = [];
  value.scripts = { ...(target?.scripts ?? {}) };
  for (const [name, command] of Object.entries(source?.scripts ?? {})) {
    if (!(name in value.scripts)) value.scripts[name] = command;
    else if (value.scripts[name] !== command) conflicts.push({ key: `scripts.${name}`, current: value.scripts[name], proposed: command });
  }
  for (const section of ['dependencies', 'devDependencies']) {
    value[section] = { ...(target?.[section] ?? {}) };
    for (const [name, proposed] of Object.entries(source?.[section] ?? {})) {
      const current = value[section][name];
      if (current === undefined && options.allowDependencyAdditions) value[section][name] = proposed;
      else if (current !== undefined && compareNumericVersion(current, proposed) < 0) {
        conflicts.push({ key: `${section}.${name}`, current, proposed, reason: 'explicit dependency migration required' });
      }
    }
    if (Object.keys(value[section]).length === 0 && !(section in (target ?? {}))) delete value[section];
  }
  return {
    value,
    conflicts,
    changed: JSON.stringify(value) !== JSON.stringify(target ?? {})
  };
}
