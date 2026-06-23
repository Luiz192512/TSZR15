function appendClassNames(styles, value, classNames) {
  if (!value) return;

  if (Array.isArray(value)) {
    for (const item of value) appendClassNames(styles, item, classNames);
    return;
  }

  if (typeof value === "object") {
    for (const [name, enabled] of Object.entries(value)) {
      if (enabled) appendClassNames(styles, name, classNames);
    }
    return;
  }

  for (const name of String(value).trim().split(/\s+/)) {
    if (name) classNames.push(styles[name] ?? name);
  }
}

export function cx(styles, ...values) {
  const classNames = [];

  for (const value of values) appendClassNames(styles, value, classNames);

  return classNames.join(" ");
}
