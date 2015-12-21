# APIm Optimized datastore builder

## What does it do?
Currently, it grabs local files that are downloads from APIm, and populates the data model from them..

## How do I use it?

1. Using the apim-export cli, put the data in ./apim-datastore/server/boot
  - How to run it:
  
    ```
    From strong-gateway-apim-pull root:
    apim-export -o ./apim-datastore/server/boot sjsldev249.dev.ciondemand.com (or server you want to pull the data from)
    ```
2. Start the node app from apim-datastore
  - The output should end with "optimizedData created:" entries
  - How to start it:
  
    ```
    From strong-gateway-apim-pull/apim-datastore:
    node .
    ```
3. You can introspect the models using the explorer: http://hostname:3000/explorer/
