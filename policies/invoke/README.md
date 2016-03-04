## Invoke

#### Overview
The invoke policy is capable of calling an api.

By default, the invoke policy sends data in `context.message` and receives data in `context.message` from the api. After the returning of the invoke policy, the content of `context.message` is updated. Check the `statusCode`, `reasonPhrase`, `headers`, and `body` in the `context.message` for the returned result.


#### Properties
See the `policy.yml`

#### JSON schema
See the `policy.yml`

#### Examples
invoke:
  target-url: https://foo.come/order?id=123
  timeout: 30
  verb: GET
  username: dude
  password: secret
  tls-profile: MySSLProfile

