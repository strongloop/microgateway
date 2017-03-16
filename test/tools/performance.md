## Performance Ttesting Tool

#### Overview
The tool that generate definition files to launching microgateway in different ways. 
Then, the performance test can send the traffic to test different microgateway configuration setting. 


#### configurations that can be set
User can set following configurations in `perf_config` file
- number of apis
- number of pathes of each apis
- if the security option is enabled or not
- if the ratelimit is set for each apis or not
- number of subscriptions
- number of credentials in each subscription

#####  Example of `perf_config`
```
{
  "apis" : 2,
  "paths" : 3,
  "security" : true,
  "ratelimit" : false,
  "subscription" : 1,
  "credentials" : 3
}

```

#### Performance Test Step-by-step
Step 1. Modify `$HOME/microgateway/test/definitions/performance/perf_config` file to 
configure the microgateway that will be launched later. (ie. how many apis, etc)

Step 2. If security is enabled and subscription number is larger than 1, check the 
"client-id" property of "application" in 
`$HOME/microgateway/test/definitions/performance/v1/catalogs/5714b14ce4b0e6c6f7d287eb/subscription` file.
This value will be need for the "X-IBM-Client-Id" header.
  

#### CURL command Examples
- security enabled
```
    curl -H "X-IBM-Client-Id:sub01_client-id_1" -d@payload.txt localhost:3000/api001_base/path01
```

#### JMeter config Examples
- Under "Test Plan", add a "Thread Group". Config the "Thread Group" as you wish.
- Under "Thread Group", add a "HTTP Request". Set hostname, port and path.
- Under "HTTP Request" add a "HTTP Header Manager". Add a Header named "X-IBM-Client-Id" and set the value "sub01_client-id_1"
- Under "Thread Group", add a "Summary Report".