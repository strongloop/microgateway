## Invoke

#### Overview
The invoke policy is capable of calling to a backend or acting as a proxy

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
