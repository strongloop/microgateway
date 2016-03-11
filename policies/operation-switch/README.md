## Operation-Switch

#### Overview
The Operation Switch policy evaluates the incoming request's
operation `verb` (HTTP `GET`, `POST`, etc), operation `path`,
and `operationId`, matching to a `case` clause, and executes
the policies associated with that case.

#### Properties
See the [policy.yml](policy.yml)

#### Examples

```
- operation-switch:
    case:
      - operations:
          - verb: GET
            path: /order
        execute:
          - set-variable:
              actions:
                - set: message.body
                  value: Retrieve orders
      - operations:
          - createOrder
        execute:
          - set-variable:
              actions:
                - set: message.body
                  value: A new order is created
```
