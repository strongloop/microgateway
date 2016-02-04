## CORS

#### Overview
The CORS policy controls the response headers returned by the gateway
when HEAD method is invoked on a path that does not have an explictly
defined HEAD operation.

#### Properties
* allow-credentials: true | false (optional; default: false)
* allow-headers: <i>header-list</i> (optional)
* allow-methods: <i>method-list</i> (optional)
* allow-origin: asterisk | <i>origin-list</i> (optional; default: asterisk)
* expose-headers: <i>header-list</i> (optional)
* max-age: <i>number of seconds for which the resource is cacheable</i> (optional)

#### JSON schema
```
id: 'http://apim.ibm.com/cors'
type: object
properties:
  allow-credentials:
    id: 'http://apim.ibm.com/cors/allow-credentials'
    type: boolean
    default: false
  allow-headers:
    id: 'http://apim.ibm.com/cors/allow-headers'
    type: string
  allow-methods:
    id: 'http://apim.ibm.com/cors/allow-methods'
    type: string
  allow-origin:
    id: 'http://apim.ibm.com/cors/allow-origin'
    type: string
    default: '*'
  expose-headers:
    id: 'http://apim.ibm.com/cors/expose-headers'
    type: string
  max-age:
    id: 'http://apim.ibm.com/cors/max-age'
    type: integer
required: []
```

#### Examples

```
x-ibm-configuration:
  assembly:
    execute:
      - cors:
```

```
x-ibm-configuration:
  assembly:
    execute:
      - cors:
          allow-origin: example.com, other.example.com
```

```
x-ibm-configuration:
  assembly:
    execute:
      - cors:
          allow-credentials: true
          allow-methods: GET, POST
          max-age: 3600
```
