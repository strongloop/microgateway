## Redaction

#### Overview
The redaction policy removes selected content from any of the request
data, response data, and activity logs.

#### Properties
    * path: <i>XPath-to-element</i>
    * action: remove | redact (optional; default: redact)
    * from: request, response, logs | all (optional; default: all)

#### JSON schema
```
id: 'http://apim.ibm.com/redaction'
type: object
properties:
  path:
    id: 'http://apim.ibm.com/redaction/path'
    type: string
  action:
    id: 'http://apim.ibm.com/redaction/action'
    type:
      enum:
        - remove
        - redact
    default: redact
  from:
    id: 'http://apim.ibm.com/redaction/from'
    type:
      enum:
        - all
        - request
        - response
        - logs
    default: all
required:
  - path
```

#### Examples

```
x-ibm-configuration:
  assembly:
    execute:
      - redact:
          items:
            - path: //reviews/review/email
              action: remove
            - path: //reviews/review/user
              action: remove
            - path: //reviews/review/comments
              action: remove
```

```
x-ibm-configuration:
  assembly:
    execute:
      - redact:
          items:
            - path: //patient/profile
              action: remove
              from: logs
            - path: //patient/history
              action: remove
              from: logs
```

```
x-ibm-configuration:
  assembly:
    execute:
      - redact:
          items:
            - path: //transactions/transaction/cardnumber
              from: response, logs
            - path: //transactions/transaction/cardholder
              from: response, logs
```
