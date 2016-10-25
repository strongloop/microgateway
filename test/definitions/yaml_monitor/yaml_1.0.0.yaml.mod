info:
  version: 1.0.0
  title: yaml 
  description: general yaml laptop test
basePath: /laptop
swagger: '2.0'
paths:
  /echo:
    post:
      operationId: postEcho
      responses:
        '200':
          description: 200 OK
  /yaml/monitor:
    put:
      summary: response plain text
      operationId: putResponse

      responses:
        '200':
          description: 200 OK

x-ibm-configuration:
  assembly:
    execute:
      - operation-switch:
          title: operation-switch
          case:
            - operations:
                - postEcho
              execute:
                - invoke:
                    title: invoke
                    target-url: 'http://localhost:8889/'
            - operations:
                - putResponse
              execute:
                - set-variable:
                    title: set-variable
                    actions:
                      - set: message.body
                        value: hello world
                - set-variable:
                    title: set-content-type
                    actions:
                      - set: message.headers.Content-Type
                        value: text/plain
schemes:
  - http
