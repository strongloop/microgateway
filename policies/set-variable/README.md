## Set Variable

#### Overview
The set-variable policy manipulates context variables in the runtime

#### Properties
See the `policy.yml`

#### JSON schema
See the `policy.yml`

#### Examples
```
- set-variable:
    actions:
      - set: message.headers.X-FOO-ID
        value: hello world
      - clear: message.headers.X-BAR-ID
```

#### Throw
The `set-variable` may throw a `PropertyError` if action is not in set, add, and clear.
