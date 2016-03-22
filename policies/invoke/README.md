## Invoke

#### Overview
The invoke policy is capable of calling an api.

By default, the invoke policy sends data in `context.message` and receives data in `context.message` from the api. After the return of the invoke policy, the content of `context.message` is updated. Check the `status.code`, `status.reason`, `headers`, and `body` in the `context.message` for the returned result.


#### Properties
See the `policy.yml`

#### JSON schema
See the `policy.yml`

#### Examples
- invoke:
    target-url: https://foo.com/order?id=123
    timeout: 30
    verb: GET
    username: dude
    password: secret
    tls-profile: MySSLProfile

#### Throw
The `invoke` may throw `PropertyError` for a bad configuration and `ConnectionError` for connection issues like timeout.

