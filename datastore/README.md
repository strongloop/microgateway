# IBM API Connect Micro Gateway Data Store

## What is it?
The data store is a loopback application for the data model of all API Connect artifacts needed by the Micro Gateway at runtime.  The data store is essential to proper API enforcement by the Micro Gateway, as the Micro Gateway queries the data store with each received request to determine the proper behavior where the desired behavior is defined by the content of the artifacts.

## How does it work?
The artifacts consumed by the data store are created one of the following ways:
- In a laptop scenario by using the API Connect CLI. 
- In an on-premises scenario by downloading from the API Connect management server.  

Once created, the data store loads these artifacts into an in-memory database on startup.  In the on-premises scenario, the in-memory database is periodically updated at run time (every 15 minutes by default).  Once the raw data is populated into the in-memory database, a specific view of the information is generated that is optimized for performant runtime lookup of the appropriate behavior for a specific request to the Micro Gateway.  The data store exposes information to the Micro Gateway using a REST interface.

## Do I need to start it explicitly?
In most cases, no.  By default, each Micro Gateway starts its own instance of the data store.  The data store can either be started within the same process space as the Micro Gateway or as its own process.  It makes sense to start the data store explicitly in certain scenarios where differing numbers of Micro Gateways and data stores are needed for optimal scaling of a solution.

## So why do I need to know about the data store?
The data store could contain sensitive information 'in the clear' so access to the data store should be restricted.  Also, the data store loads information on start up and periodically (on-premises only).  If the source information is updated, it might be necessary to restart the data store to pick up the latest information quicker than happens by default.

## Environment Variables

- APIMANAGER : Host of the API Connect management server you need to connect to. (on-premises only)
- APIMANAGER_CATALOG : Catalog that the Micro Gateway is responsible for servicing. (on-premises only)
- APIMANAGER_PORT : Port to connect to the API Connect management server on. (on-premises only)
- APIMANAGER_REFRESH_INTERVAL : Interval in milliseconds (defaults to 15 minutes) on how long to wait before fetching updated artifacts from the API Connect management server (on-premises only)
- CONFIG_DIR :
  Directory of Swagger to load. (On-premises, this is used for initial load. On-premises loads into ./config for subsequent loads.)
- DATASTORE_PORT : Port for the data store to listen for requests on.
  By default, the data store binds to port 0, causing an ephemeral port listen
  If set before startup, the data store listens on that port
- LAPTOP_RATELIMIT : Rate limit (defaults to 100/hour) to apply for all requests (laptop only)
