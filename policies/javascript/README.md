## JavaScript Policy

#### Overview
It's a policy to execute a snippet of JavaScript code. The JavaScript code is executed with limited capabilities. The limitations are:

- No `require()` is available
- Global objects of nodejs are not available
- Can't use 'use strict' inside the JavaScript code
  - Therefore, no block-scoped declarations. i.e.: let and const 

Inside the JavaScript code, the properties of context object could be accessed/modified directly. For example:
```
    if (request.verb === 'POST') {
      //perform some business logic when the request is POST
    }
```

You can throw an error object which contains the error information and changes the flow afterwards. For example:
```
    if (request.body.order === undefined) {
        throw { name : 'IncorrectOrder', value: 'the payload should contain valid order' };
    }
```

The error object above could be caught by `catch` assembly like this:
```
    - errors:
      - 'IncorrectOrder'
        execute:
        - set-variable:
          set: 'message.body'
          value: '{ "error" : "incorrect order" }'
```

#### Properties
See the `policy.yml`

#### JSON schema
See the `policy.yml`

