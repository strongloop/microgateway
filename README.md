# APIm Optimized datastore builder

## What does it do?
Currently, it grabs local files that are downloads from APIm, and populates the data model from them..

## How do I use it manually?

1. Using the apim-export cli, put the data wherever you want (this example uses ./data-store/server/boot).. then softlink to ./config/current
  - How to run it:
  
    ```
    From strong-gateway root:
    apim-export -o ./apim-datastore/server/boot sjsldev249.dev.ciondemand.com (or server you want to pull the data from)
    ```
1. Introspect the models using the explorer: http://hostname:5000/explorer/
1. Test the lookup using the apim-getcontext cli (outputs contents that would be returned to the preflow)
  - examples:
    ```
    
    apim-getcontext -p /apim/sb/v1/ascents   -c fb82cb59-ba95-4c34-8612-e63697d7b845 -m GET
    apim-getcontext -p /apim/sb/v1/ascents   -c 612caa59-9649-491f-99b7-d9a941c4bd2e -m GET
    apim-getcontext -p /apim/sb/v1/forecasts -c 612caa59-9649-491f-99b7-d9a941c4bd2e -m GET
    ```
