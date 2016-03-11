## Throw

#### Overview
The `throw` policy allows the assembly devloper to throw a custom error at runtime.

Specify the `name` and the human-readable `message` to generate a custom error. The error can be caught by its name.


#### Properties
See the `policy.yml`

#### JSON schema
See the `policy.yml`

#### Examples
```
- throw:
    name: DeleteOrderError
    message: Cannot find the order with the id '123'
```

#### Throw
The `throw` may throw any custom error.
