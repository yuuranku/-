export function splitSqlStatements(sql) {
  const statements = []
  let buffer = ''
  let index = 0
  let mode = 'normal'
  let dollarTag = ''
  let blockDepth = 0

  const push = () => {
    const statement = buffer.trim()
    if (statement) statements.push(statement)
    buffer = ''
  }

  while (index < sql.length) {
    const character = sql[index]
    const next = sql[index + 1]

    if (mode === 'normal') {
      if (character === '-' && next === '-') {
        buffer += '--'
        index += 2
        mode = 'line-comment'
        continue
      }
      if (character === '/' && next === '*') {
        buffer += '/*'
        index += 2
        blockDepth = 1
        mode = 'block-comment'
        continue
      }
      if (character === "'") {
        buffer += character
        index += 1
        mode = 'single-quote'
        continue
      }
      if (character === '"') {
        buffer += character
        index += 1
        mode = 'double-quote'
        continue
      }
      if (character === '$') {
        const tagMatch = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
        if (tagMatch) {
          dollarTag = tagMatch[0]
          buffer += dollarTag
          index += dollarTag.length
          mode = 'dollar-quote'
          continue
        }
      }
      if (character === ';') {
        push()
        index += 1
        continue
      }
      buffer += character
      index += 1
      continue
    }

    if (mode === 'line-comment') {
      buffer += character
      index += 1
      if (character === '\n') mode = 'normal'
      continue
    }

    if (mode === 'block-comment') {
      if (character === '/' && next === '*') {
        buffer += '/*'
        index += 2
        blockDepth += 1
        continue
      }
      if (character === '*' && next === '/') {
        buffer += '*/'
        index += 2
        blockDepth -= 1
        if (blockDepth === 0) mode = 'normal'
        continue
      }
      buffer += character
      index += 1
      continue
    }

    if (mode === 'single-quote') {
      buffer += character
      index += 1
      if (character === "'" && next === "'") {
        buffer += next
        index += 1
      } else if (character === "'") {
        mode = 'normal'
      }
      continue
    }

    if (mode === 'double-quote') {
      buffer += character
      index += 1
      if (character === '"' && next === '"') {
        buffer += next
        index += 1
      } else if (character === '"') {
        mode = 'normal'
      }
      continue
    }

    if (mode === 'dollar-quote') {
      if (sql.startsWith(dollarTag, index)) {
        buffer += dollarTag
        index += dollarTag.length
        mode = 'normal'
      } else {
        buffer += character
        index += 1
      }
    }
  }

  push()
  return statements
}

export function normalizedStatementStart(statement) {
  return statement
    .replace(/^\s*(?:--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/\s*)*/g, '')
    .trimStart()
    .toLowerCase()
}
