# microgateway
The `microgateway` is the enforcement component of the
[IBM API Connect](https://developer.ibm.com/apiconnect/) collection of
components providing solutions for API creation, deployment, lifecycle
management, monitization, and enforcement. The microgateway is fundamentally
a proxy, securing and forwarding requests to backend APIs.

It was created using StrongLoop technology and a series of middleware
components. The package is customized to work with the apiconnect 
infrastructure that automatically communicates with the micro gateway to
dynamically load APIs, Products, and Plans so that APIs are secured and
processed in a seamless fashion.

# Installation
In the apiconnect laptop experience, the microgateway is automatically
downloaded and setup by the laptop run and start functions. You do not
need to manually download and install it.

If you would like to use `microgateway` as a standalone gateway,
use `npm install microgateway` to install it. To start the gateway,
change working directories to where the microgateway installed
(e.g. `cd node_modules/microgateway`), and use `node .`.

## Configuration
By default, the gateway look up the configuration from `config/default`
directory. The configuration includes the APIs, Products, and Plans metadata.
You can define an alternative configuration directory via providing the
`CONFIG_DIR` environment variable.
